import os
import tempfile
import unittest

from skill_trainer import SessionStore, breakdown, weekly_trainer


class SkillTrainerTest(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tempdir.name, "sessions.json")

    def tearDown(self):
        self.tempdir.cleanup()

    def store(self):
        return SessionStore(self.path)

    def test_weekly_session_survives_new_store_instance(self):
        weekly_trainer(None, "u1", self.store(), send=False)
        result = weekly_trainer("突破", "u1", self.store(), send=False)
        self.assertIn("第二步", result)
        self.assertEqual(self.store().get("u1", "weekly")["keyword"], "突破")

    def test_breakdown_collects_four_answers(self):
        self.assertIn("Q1", breakdown("发布课程", "u1", self.store(), send=False))
        self.assertIn("Q2", breakdown("课程页面上线", "u1", self.store(), send=False))
        self.assertIn("Q3", breakdown("已有文案", "u1", self.store(), send=False))
        self.assertIn("Q4", breakdown("用户是否愿意买", "u1", self.store(), send=False))
        result = breakdown("找 5 人访谈", "u1", self.store(), send=False)
        self.assertIn("拆解完成", result)
        self.assertIn("找 5 人访谈", result)
        self.assertIsNone(self.store().get("u1", "breakdown"))


if __name__ == "__main__":
    unittest.main()
