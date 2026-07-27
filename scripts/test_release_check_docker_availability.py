"""Regression coverage for release checks on hosts without Docker Compose."""

from __future__ import annotations

import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
RELEASE_CHECK = REPOSITORY_ROOT / "scripts" / "release-check.sh"


class ReleaseCheckDockerAvailabilityTests(unittest.TestCase):
    @staticmethod
    def write_executable(path: Path, contents: str) -> None:
        path.write_text(contents)
        path.chmod(path.stat().st_mode | stat.S_IXUSR)

    def test_unavailable_docker_compose_marks_checks_blocked(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            fake_bin = Path(temporary_directory)
            for command in ("python3", "pnpm", "bash"):
                executable = fake_bin / command
                self.write_executable(executable, "#!/bin/sh\nexit 0\n")

            docker = fake_bin / "docker"
            self.write_executable(docker, "#!/bin/sh\nexit 127\n")

            environment = os.environ | {"PATH": f"{fake_bin}:/usr/bin:/bin"}
            result = subprocess.run(
                ["/bin/bash", str(RELEASE_CHECK)],
                cwd=REPOSITORY_ROOT,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(
            "BLOCKED base Compose validation without interpolation (Docker Compose is unavailable)",
            result.stdout,
        )
        self.assertIn(
            "BLOCKED pilot Compose validation without interpolation (Docker Compose is unavailable)",
            result.stdout,
        )
        self.assertNotIn("FAIL base Compose validation", result.stdout)
        self.assertNotIn("FAIL pilot Compose validation", result.stdout)

    def test_live_service_probe_reads_complete_compose_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            fake_bin = Path(temporary_directory)
            for command in ("python3", "pnpm", "bash"):
                self.write_executable(fake_bin / command, "#!/bin/sh\nexit 0\n")
            self.write_executable(fake_bin / "curl", "#!/bin/sh\nprintf '200'\n")
            self.write_executable(
                fake_bin / "docker",
                """#!/bin/sh
case \"$*\" in
  *\" ps --status running\"*)
    count=0
    while [ \"$count\" -lt 10000 ]; do
      printf 'callquanta-api running\\ncallquanta-web running\\n'
      count=$((count + 1))
    done
    ;;
esac
exit 0
""",
            )

            environment = os.environ | {
                "PATH": f"{fake_bin}:/usr/bin:/bin",
                "RELEASE_CHECK_RUN_LIVE": "true",
            }
            result = subprocess.run(
                ["/bin/bash", str(RELEASE_CHECK)],
                cwd=REPOSITORY_ROOT,
                env=environment,
                text=True,
                capture_output=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("PASS required live services are running", result.stdout)
        self.assertNotIn("BLOCKED live checks (required services are not running)", result.stdout)


if __name__ == "__main__":
    unittest.main()
