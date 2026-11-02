import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'plugin'))
from lotes_sehurb.adapters.google_tiles import GoogleTilesClient, GoogleConnectionError


class GoogleTransportTests(unittest.TestCase):
    def test_empty_key_rejected(self):
        with self.assertRaises(GoogleConnectionError):
            GoogleTilesClient('')

    def test_authentication_error_does_not_expose_key(self):
        client = GoogleTilesClient('secret-test-value')
        error = HTTPError('https://example.com/?key=secret-test-value', 403, 'forbidden', {}, None)
        with patch('lotes_sehurb.adapters.google_tiles.urlopen', side_effect=error):
            with self.assertRaises(GoogleConnectionError) as raised:
                client.connect((-68, -10, -67, -9))
        self.assertNotIn('secret-test-value', str(raised.exception))

    def test_session_and_attribution_from_official_contract(self):
        client = GoogleTilesClient('test-key')
        responses = [(b'{"session":"test-session","expiry":"9999999999"}', 'application/json'),
                     (b'{"copyright":"Test provider"}', 'application/json')]
        with patch.object(client, '_request', side_effect=responses) as request:
            client.connect((-68, -10, -67, -9))
        self.assertEqual(client.attribution, 'Google Maps · Test provider')
        self.assertEqual(request.call_args_list[0].args[0], '/v1/createSession')
        self.assertEqual(request.call_args_list[1].args[0], '/tile/v1/viewport')
        client.clear()
        self.assertEqual(client._key, '')

    def test_expired_session_does_not_fetch_tiles(self):
        client = GoogleTilesClient('test-key')
        client._session = 'test'
        client.expiry = time.time() - 1
        with patch.object(client, '_request') as request:
            with self.assertRaises(GoogleConnectionError):
                client.tile(1, 0, 0)
            request.assert_not_called()
