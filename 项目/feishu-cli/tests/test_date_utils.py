import unittest

from date_utils import parse_date, parse_date_entries


class DateUtilsTest(unittest.TestCase):
    def test_parse_supported_date_formats(self):
        self.assertEqual(parse_date("2026.7.13 日报"), "2026-07-13")
        self.assertEqual(parse_date("2026/07/14"), "2026-07-14")
        self.assertIsNone(parse_date("2026-02-30"))

    def test_parse_entries(self):
        entries = parse_date_entries("前言\n2026.7.13 日报\n完成 A\n2026-07-14\n完成 B")
        self.assertEqual([item["date"] for item in entries], ["2026-07-13", "2026-07-14"])
        self.assertIn("完成 A", entries[0]["content"])


if __name__ == "__main__":
    unittest.main()
