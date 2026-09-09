import { useSession } from "next-auth/react";
import { useMemo } from "react";
import OGXClient, { type ClientOptions } from "ogx-client";

export function useAuthClient() {
  const { data: session } = useSession();

  const client = useMemo(() => {
    const clientHostname =
      typeof window !== "undefined" ? window.location.origin : "";

    const options: ClientOptions = {
      baseURL: `${clientHostname}/api`,
    };

    if (session?.accessToken) {
      options.apiKey = session.accessToken;
    }

    return new OGXClient(options);
  }, [session?.accessToken]);

  return client;
}
