# Copyright (c) The OGX Contributors.
# All rights reserved.
#
# This source code is licensed under the terms described in the LICENSE file in
# the root directory of this source tree.

from typing import Any

import httpx
from starlette.types import ASGIApp, Receive, Scope, Send

from ogx.core.access_control.datatypes import RouteAccessRule
from ogx.core.access_control.route_access import is_route_allowed
from ogx.core.datatypes import AuthenticationConfig
from ogx.core.request_headers import user_from_scope
from ogx.core.server.auth_providers import create_auth_provider
from ogx.core.server.routes import find_matching_route, initialize_route_impls
from ogx.log import get_logger
from ogx_api import Api
from ogx_api.common.errors import AuthServiceUnavailableError, OpenAIErrorResponse, TokenValidationError

logger = get_logger(name=__name__, category="core::auth")


class AuthenticationMiddleware:
    """Middleware that authenticates requests using configured authentication provider.

    This middleware:
    1. Extracts the Bearer token from the Authorization header
    2. Uses the configured auth provider to validate the token
    3. Extracts user attributes from the provider's response
    4. Makes these attributes available to the route handlers for access control

    Unauthenticated Access:
    Endpoints can opt out of authentication by setting openapi_extra={PUBLIC_ROUTE_KEY: True}
    on their FastAPI route. This is typically used for operational endpoints like /health
    and /version to support monitoring, load balancers, and observability tools.

    The middleware supports multiple authentication providers through the AuthProvider interface:
    - Kubernetes: Validates tokens against the Kubernetes API server
    - Custom: Validates tokens against a custom endpoint

    Authentication Request Format for Custom Auth Provider:
    ```json
    {
        "api_key": "the-api-key-extracted-from-auth-header",
        "request": {
            "path": "/models/list",
            "headers": {
                "content-type": "application/json",
                "user-agent": "..."
                // All headers except Authorization
            },
            "params": {
                "limit": ["100"],
                "offset": ["0"]
                // Query parameters as key -> list of values
            }
        }
    }
    ```

    Expected Auth Endpoint Response Format:
    ```json
    {
        "access_attributes": {    // Structured attribute format
            "roles": ["admin", "user"],
            "teams": ["ml-team", "nlp-team"],
            "projects": ["llama-3", "project-x"],
            "namespaces": ["research"]
        },
        "message": "Optional message about auth result"
    }
    ```

    Token Validation:
    Each provider implements its own token validation logic:
    - Kubernetes: Uses TokenReview API to validate service account tokens
    - Custom: Sends token to custom endpoint for validation

    Attribute-Based Access Control:
    The attributes returned by the auth provider are used to determine which
    resources the user can access. Resources can specify required attributes
    using the access_attributes field. For a user to access a resource:

    1. All attribute categories specified in the resource must be present in the user's attributes
    2. For each category, the user must have at least one matching value

    If the auth provider doesn't return any attributes, the user will only be able to
    access resources that don't have access_attributes defined.
    """

    def __init__(self, app: ASGIApp, auth_config: AuthenticationConfig, impls: dict[Api, Any]) -> None:
        self.app = app
        self.impls = impls
        self.auth_provider = create_auth_provider(auth_config)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> Any:
        if scope["type"] == "http":
            # Find the route and check if authentication is required
            path = scope.get("path", "")
            method = scope.get("method", "GET")

            if not hasattr(self, "route_impls"):
                self.route_impls = initialize_route_impls(self.impls)

            webmethod = None
            try:
                _, _, _, webmethod = find_matching_route(method, path, self.route_impls)
            except ValueError:
                # If no matching endpoint is found, pass here to run auth anyways
                pass

            # If webmethod explicitly sets require_authentication=False, allow without auth
            if webmethod and webmethod.require_authentication is False:
                logger.debug("Allowing unauthenticated access to endpoint", path=path)
                return await self.app(scope, receive, send)

            # Handle authentication
            if self.auth_provider.requires_http_bearer:
                headers = dict(scope.get("headers", []))
                auth_header = headers.get(b"authorization", b"").decode()

                if not auth_header:
                    error_msg = self.auth_provider.get_auth_error_message(scope)
                    return await self._send_auth_error(send, error_msg)

                if not auth_header.startswith("Bearer "):
                    return await self._send_auth_error(send, "Invalid Authorization header format")

                token = auth_header.split("Bearer ", 1)[1]
            else:
                token = ""

            # Validate token and get access attributes
            try:
                validation_result = await self.auth_provider.validate_token(token, scope)
            except AuthServiceUnavailableError as e:
                logger.warning("Authentication service unavailable", error=str(e))
                return await self._send_auth_error(send, str(e), status=503)
            except httpx.TimeoutException:
                logger.warning("Authentication request timed out")
                return await self._send_auth_error(send, "Authentication service timeout", status=503)
            except TokenValidationError as e:
                logger.warning("Token validation failed", error=str(e))
                return await self._send_auth_error(send, str(e))
            except ValueError as e:
                logger.warning("Authentication error", error=str(e))
                return await self._send_auth_error(send, str(e))
            except Exception:
                logger.exception("Error during authentication")
                return await self._send_auth_error(send, "Authentication service error")

            # Store the client ID in the request scope for downstream use
            # (e.g., access control, logging, per-client context).
            scope["authenticated_client_id"] = token or validation_result.principal

            # Store attributes in request scope
            scope["principal"] = validation_result.principal
            if validation_result.attributes:
                scope["user_attributes"] = validation_result.attributes
            logger.debug(
                "Authentication successful: with attributes",
                principal=validation_result.principal,
                attributes_count=len(validation_result.attributes) if validation_result.attributes else 0,
            )

        return await self.app(scope, receive, send)

    async def _send_auth_error(self, send: Send, message: str, status: int = 401) -> None:
        await send(
            {
                "type": "http.response.start",
                "status": status,
                "headers": [[b"content-type", b"application/json"]],
            }
        )
        error_msg = OpenAIErrorResponse.from_message(message).to_bytes()
        await send({"type": "http.response.body", "body": error_msg})


class RouteAuthorizationMiddleware:
    """Middleware that enforces route-level access control.

    This middleware runs after authentication and checks if the authenticated user
    has permission to access the requested API route based on route_policy rules.

    """

    def __init__(self, app: ASGIApp, route_policy: list[RouteAccessRule]) -> None:
        self.app = app
        self.route_policy = route_policy

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> Any:
        # Only process HTTP requests
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        # If no route policy configured, allow all routes (backward compatible)
        if not self.route_policy:
            return await self.app(scope, receive, send)

        route = scope.get("path", "")
        # Normalize route: remove trailing slash (except for root "/")
        if route != "/" and route.endswith("/"):
            route = route.rstrip("/")

        # Get authenticated user from scope (set by AuthenticationMiddleware if present)
        user = user_from_scope(scope)

        # Check if user has permission to access this route. Delegates to the same
        # evaluation used outside the HTTP layer (see access_control.route_access)
        # so a route forbidden here can't be reached indirectly, e.g. through
        # in-process background processing.
        if not is_route_allowed(route, user, self.route_policy):
            return await self._send_error(
                send, f"Access denied: insufficient permissions for route {route}", status=403
            )

        return await self.app(scope, receive, send)

    async def _send_error(self, send: Send, message: str, status: int = 403) -> None:
        """Send an error response."""
        await send(
            {
                "type": "http.response.start",
                "status": status,
                "headers": [[b"content-type", b"application/json"]],
            }
        )
        error_msg = OpenAIErrorResponse.from_message(message).to_bytes()
        await send({"type": "http.response.body", "body": error_msg})
