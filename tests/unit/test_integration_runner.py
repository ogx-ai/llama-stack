# Copyright (c) The OGX Contributors.
# All rights reserved.
#
# This source code is licensed under the terms described in the LICENSE file in
# the root directory of this source tree.

import os
import subprocess
from pathlib import Path

import pytest


@pytest.mark.parametrize("install_exit_code", [0, 42])
def test_integration_runner_stops_after_failed_dependency_install(tmp_path: Path, install_exit_code: int) -> None:
    command_dir = tmp_path / "bin"
    command_dir.mkdir()
    install_log = tmp_path / "install.log"
    pytest_log = tmp_path / "pytest.log"
    commands = {
        "uv": """#!/bin/bash
case "$1 $2" in
    "pip list")
        if [[ "${3:-}" != "--format=freeze" ]]; then
            echo "ogx 1.0.2"
        fi
        ;;
    "pip install")
        echo "$*" > "$INSTALL_LOG"
        exit "$INSTALL_EXIT_CODE"
        ;;
    *) exit 99 ;;
esac
""",
        "ogx": """#!/bin/bash
if [[ "$1 $2" == "stack list-deps" ]]; then
    echo "sentence-transformers>=2"
else
    exit 99
fi
""",
        "python": "#!/bin/bash\nexit 0\n",
        "pytest": '#!/bin/bash\necho "$*" > "$PYTEST_LOG"\n',
    }
    for name, contents in commands.items():
        command = command_dir / name
        command.write_text(contents)
        command.chmod(0o755)

    environment = {
        **os.environ,
        "PATH": f"{command_dir}{os.pathsep}{os.environ['PATH']}",
        "TMPDIR": str(tmp_path),
        "INSTALL_EXIT_CODE": str(install_exit_code),
        "INSTALL_LOG": str(install_log),
        "PYTEST_LOG": str(pytest_log),
    }
    environment.pop("TS_CLIENT_PATH", None)
    environment.pop("INTEGRATION_TESTS_POST_CMD", None)
    root = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        [
            "bash",
            str(root / "scripts/integration-tests.sh"),
            "--stack-config",
            "ci-tests",
            "--setup",
            "gpt",
            "--install-deps",
        ],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )

    assert install_log.read_text().strip() == "pip install sentence-transformers>=2"
    assert result.returncode == (0 if install_exit_code == 0 else 1), result.stdout + result.stderr
    assert pytest_log.exists() == (install_exit_code == 0)
