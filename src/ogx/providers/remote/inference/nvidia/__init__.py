# Copyright (c) The OGX Contributors.
# All rights reserved.
#
# This source code is licensed under the terms described in the LICENSE file in
# the root directory of this source tree.

from ogx_api import Inference

from .config import NVIDIAConfig


<<<<<<< HEAD
async def get_adapter_impl(config: NVIDIAConfig, _deps) -> Inference:
    # import dynamically so `ogx list-deps` does not fail due to missing dependencies
=======
async def get_adapter_impl(config: NVIDIAConfig, _deps):
    # import dynamically so `ogx stack list-deps` does not fail due to missing dependencies
>>>>>>> f7f4ee4 (fix(docs): correct list-deps CLI commands after the OGX rename (#6459))
    from .nvidia import NVIDIAInferenceAdapter

    if not isinstance(config, NVIDIAConfig):
        raise RuntimeError(f"Unexpected config type: {type(config)}")
    adapter = NVIDIAInferenceAdapter(config=config)
    await adapter.initialize()
    return adapter


__all__ = ["get_adapter_impl", "NVIDIAConfig"]
