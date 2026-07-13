import unittest
from unittest.mock import patch

import ai_news


class AiNewsTest(unittest.TestCase):
    def test_deduplicate_by_url_and_title(self):
        items = [
            {"title": "Same news", "url": "https://example.com/a?utm=x", "source": "A", "score": 1},
            {"title": "Other title", "url": "https://example.com/a", "source": "B", "score": 2},
            {"title": "Same news!", "url": "https://example.com/b", "source": "C", "score": 3},
        ]
        self.assertEqual(len(ai_news.deduplicate(items)), 1)

    def test_diversify_caps_each_source(self):
        items = [
            {"title": f"A{i}", "url": f"https://a/{i}", "source": "A", "score": 10 - i}
            for i in range(5)
        ] + [{"title": "B", "url": "https://b/1", "source": "B", "score": 1}]
        selected = ai_news.diversify(items, per_source=2)
        self.assertEqual(sum(item["source"] == "A" for item in selected), 2)
        self.assertTrue(any(item["source"] == "B" for item in selected))

    @patch("ai_news._llm")
    def test_generate_uses_original_url(self, llm):
        llm.return_value = '[{"id":"item-1","title_zh":"可信标题","reason":"与当前项目相关"}]'
        source = lambda _count: [{
            "title": "Original", "url": "https://trusted.example/story", "source": "Test", "score": 9
        }]
        output = ai_news.generate(fetchers=[(source, 1)])
        self.assertIn("https://trusted.example/story", output)
        self.assertIn("可信标题", output)


if __name__ == "__main__":
    unittest.main()
