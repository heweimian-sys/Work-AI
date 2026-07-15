import os
import tempfile
import unittest
from unittest.mock import patch

from command_router import command_name, execute, is_write_command
from news_store import NewsStore


class CommandRouterTest(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.store = NewsStore(os.path.join(self.tempdir.name, "news.db"))

    def tearDown(self):
        self.tempdir.cleanup()

    def test_recognizes_fixed_commands(self):
        self.assertEqual(command_name("AI资讯"), "news")
        self.assertEqual(command_name("日报"), "daily")
        self.assertEqual(command_name("ddl"), "ddl")
        self.assertEqual(command_name("录入：完成测试"), "note")
        self.assertEqual(command_name("AI资讯反馈 N-1234abcd useful"), "feedback")
        self.assertEqual(command_name("自我介绍一下"), "intro")
        self.assertIsNone(command_name("帮我分析项目"))

    def test_write_classification(self):
        self.assertTrue(is_write_command("note"))
        self.assertTrue(is_write_command("feedback"))
        self.assertFalse(is_write_command("news"))

    def test_plain_chat_is_not_a_fixed_command(self):
        self.assertIsNone(command_name("帮我整理这些链接"))

    @patch("command_router.append_to_log")
    def test_note_routes_without_llm(self, append):
        result = execute("录入: 完成确定性路由", store=self.store)
        append.assert_called_once_with("完成确定性路由")
        self.assertIn("已记入日志", result)

    def test_news_routes_and_records_history(self):
        fetcher = lambda _count: [{
            "title": "Agent release",
            "url": "https://example.com/agent",
            "source": "Example",
            "score": 10,
        }]
        with patch("ai_news._llm", return_value=None):
            result = execute("AI资讯", store=self.store, fetchers=[(fetcher, 1)])
        self.assertIn("https://example.com/agent", result)
        enriched = self.store.enrich([fetcher(1)[0]])
        self.assertEqual(self.store.filter_recent(enriched), [])


if __name__ == "__main__":
    unittest.main()
