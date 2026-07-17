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
    def test_unavailable_docker_compose_marks_checks_blocked(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            fake_bin = Path(temporary_directory)
            for command in ("python3", "pnpm", "bash"):
                executable = fake_bin / command
                executable.write_text("#!/bin/sh\nexit 0\n")
                executable.chmod(executable.stat().st_mode | stat.S_IXUSR)

            docker = fake_bin / "docker"
            docker.write_text("#!/bin/sh\nexit 127\n")
            docker.chmod(docker.stat().st_mode | stat.S_IXUSR)

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


if __name__ == "__main__":
    unittest.main()
