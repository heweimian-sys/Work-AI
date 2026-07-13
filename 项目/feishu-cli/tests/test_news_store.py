import os
import tempfile
import unittest

from news_store import NewsStore, fingerprint


class NewsStoreTest(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.store = NewsStore(os.path.join(self.tempdir.name, "news.db"))
        self.item = {
            "title": "Agent release",
            "url": "https://example.com/agent",
            "source": "Example",
            "score": 10,
        }

    def tearDown(self):
        self.tempdir.cleanup()

    def test_sent_item_is_filtered_in_history_window(self):
        enriched = self.store.enrich([self.item])
        self.assertEqual(enriched[0]["item_id"], fingerprint(self.item["url"]))
        self.assertEqual(len(self.store.filter_recent(enriched)), 1)
        self.store.record_sent(enriched)
        self.assertEqual(self.store.filter_recent(enriched), [])

    def test_feedback_changes_source_affinity(self):
        enriched = self.store.enrich([self.item])
        self.store.record_sent(enriched)
        item_id = enriched[0]["item_id"]
        self.store.add_feedback(item_id, "useful")
        self.store.add_feedback(item_id, "later")
        self.assertEqual(self.store.source_affinity()["Example"], 3.0)
        self.assertEqual(self.store.feedback_summary()["useful"], 1)

    def test_unknown_item_feedback_is_rejected(self):
        with self.assertRaises(KeyError):
            self.store.add_feedback("N-unknown", "useful")


if __name__ == "__main__":
    unittest.main()
