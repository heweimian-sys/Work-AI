import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import weekly_report
import feishu_api


class WeeklyReportTest(unittest.TestCase):
    def test_local_app_data_is_primary_env_location(self):
        with patch.dict("os.environ", {"LOCALAPPDATA": r"C:\Local"}, clear=False):
            paths = feishu_api._env_paths()
        self.assertEqual(paths[0], r"C:\Local\hermes\.env")

    @patch("feishu_api._get")
    @patch("feishu_api.get_primary_calendar", return_value="primary")
    def test_list_events_returns_stable_fields(self, _calendar, get):
        get.return_value = {
            "code": 0,
            "data": {
                "has_more": False,
                "items": [{
                    "event_id": "event-1",
                    "summary": "周报复盘",
                    "start_time": {"date_time": "2026-07-24T19:00:00+08:00"},
                    "end_time": {"date_time": "2026-07-24T20:00:00+08:00"},
                }],
            },
        }
        events = feishu_api.list_events("start", "end")
        self.assertEqual(events[0]["summary"], "周报复盘")
        self.assertEqual(events[0]["event_id"], "event-1")

    def test_personal_draft_requires_all_sections(self):
        errors = weekly_report.validate_draft("核心工作\n完成 A", "personal")
        self.assertTrue(any("项目进展" in error for error in errors))

    def test_valid_personal_draft(self):
        content = "\n".join([
            "核心工作",
            "完成关键事项 A。",
            "项目进展",
            "项目 B 已完成阶段验证。",
            "思考沉淀",
            "形成了可复用的检查方法。",
            "下周计划",
            "完成项目 B 的下一阶段交付。",
        ])
        self.assertEqual(weekly_report.validate_draft(content, "personal"), [])

    def test_publish_requires_explicit_confirmation(self):
        with self.assertRaisesRegex(RuntimeError, "--confirm"):
            weekly_report.publish("personal", "unused.md", confirmed=False)

    @patch("weekly_report.append_to_doc")
    @patch("weekly_report._load_config")
    def test_confirmed_publish_appends_valid_draft(self, load_config, append):
        load_config.return_value = {"documents": {"report": "doc-token"}}
        content = "\n".join([
            "核心工作",
            "完成关键事项 A。",
            "项目进展",
            "项目 B 已完成阶段验证。",
            "思考沉淀",
            "形成了可复用的检查方法。",
            "下周计划",
            "完成项目 B 的下一阶段交付。",
        ])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "weekly.md"
            path.write_text(content, encoding="utf-8")
            result = weekly_report.publish("personal", path, confirmed=True)
        append.assert_called_once()
        self.assertEqual(result["report_type"], "personal")


if __name__ == "__main__":
    unittest.main()
