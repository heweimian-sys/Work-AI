import tempfile
import unittest
from pathlib import Path

import yaml

from migrate_hermes_config import migrate, read_env


class MigrationTests(unittest.TestCase):
    def test_canonical_values_win_and_templates_are_installed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            for name in ("SOUL.md", "USER.md", "MEMORY.md"):
                path = source / "hermes" / "templates" / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(name, encoding="utf-8")
            skill = source / "hermes" / "skills" / "feishu-cli" / "SKILL.md"
            skill.parent.mkdir(parents=True, exist_ok=True)
            skill.write_text("skill", encoding="utf-8")
            canonical = root / "canonical"
            canonical.mkdir()
            (canonical / ".env").write_text("TOKEN=canonical\nFEISHU_OPEN_ID=owner\n", encoding="utf-8")
            (canonical / "config.yaml").write_text("agent:\n  skip_context_files: true\n", encoding="utf-8")
            legacy = root / "legacy"
            legacy.mkdir()
            (legacy / ".env").write_text("TOKEN=legacy\nEXTRA=yes\n", encoding="utf-8")

            migrate(source, canonical, [legacy])

            env = read_env(canonical / ".env")
            self.assertEqual(env["TOKEN"], "canonical")
            self.assertEqual(env["EXTRA"], "yes")
            self.assertEqual(env["FEISHU_OWNER_OPEN_ID"], "owner")
            config = yaml.safe_load((canonical / "config.yaml").read_text(encoding="utf-8"))
            self.assertFalse(config["agent"]["skip_context_files"])
            self.assertTrue(config["memory"]["memory_enabled"])
            self.assertFalse(config["memory"]["user_profile_enabled"])
            self.assertEqual((canonical / "SOUL.md").read_text(encoding="utf-8"), "SOUL.md")
