import tempfile
import unittest
from pathlib import Path

from memory_candidates import CandidateMemoryStore


class CandidateMemoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.store = CandidateMemoryStore(root / "candidates.db", root / "MEMORY.md")

    def tearDown(self):
        self.temp.cleanup()

    def test_approval_requires_confirmation(self):
        candidate = self.store.propose("保留可复用的发布检查表", "workflow")
        with self.assertRaises(PermissionError):
            self.store.approve(candidate)
        self.store.approve(candidate, confirmed=True)
        self.assertIn("保留可复用的发布检查表", Path(self.store.memory_path).read_text(encoding="utf-8"))

    def test_protected_category_is_rejected(self):
        with self.assertRaises(ValueError):
            self.store.propose("更改管理员", "permission")
