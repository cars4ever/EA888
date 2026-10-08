"""Release signing recovery: use the existing key and reject broken paths before building."""
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import build_android as build


class SigningTests(unittest.TestCase):
    def test_local_signing_overrides_broken_exports_without_changing_shell(self):
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            keys = home / 'keys'
            keys.mkdir()
            key = keys / 'ea888-lab-release.jks'
            key.write_bytes(b'fixture key')
            (keys / 'ea888-lab-release-key.txt').write_text('Alias: fixture\nWachtwoord: fixture-password\n')
            stale = {'EA888_KEYSTORE': str(keys / 'ea888-lab-'), 'EA888_KEY_PASSWORD': 'stale',
                     'EA888_STORE_PASSWORD': 'stale', 'EA888_KEYSTORE_B64': 'stale'}
            with patch.dict(os.environ, stale), patch.object(Path, 'home', return_value=home):
                env, temporary = build.signing_env(local_signing=True)
                build.validate_release_signing(env)
                self.assertEqual(env['EA888_KEYSTORE'], str(key))
                self.assertEqual(env['EA888_KEY_ALIAS'], 'fixture')
                self.assertEqual(env['EA888_KEY_PASSWORD'], 'fixture-password')
                self.assertEqual(env['EA888_STORE_PASSWORD'], 'fixture-password')
                self.assertNotIn('EA888_KEYSTORE_B64', env)
                self.assertIsNone(temporary)
                self.assertEqual(os.environ['EA888_KEY_PASSWORD'], 'stale')

    def test_broken_path_fails_before_web_or_gradle(self):
        with tempfile.TemporaryDirectory() as folder:
            env = {'EA888_KEYSTORE': str(Path(folder) / 'ea888-lab-'),
                   'EA888_KEY_ALIAS': 'fixture', 'EA888_KEY_PASSWORD': 'fixture-secret'}
            with patch.object(sys, 'argv', ['build_android.py']), \
                 patch.object(build, 'sdk_root', return_value=Path(folder)), \
                 patch.object(build, 'signing_env', return_value=(env, None)), \
                 patch.object(build.subprocess, 'run') as run:
                with self.assertRaises(SystemExit) as error:
                    build.main()
                self.assertIn('Release keystore not found', str(error.exception))
                self.assertNotIn('fixture-secret', str(error.exception))
                run.assert_not_called()

    def test_missing_local_metadata_does_not_fall_back_to_another_key(self):
        with tempfile.TemporaryDirectory() as folder, \
             patch.object(Path, 'home', return_value=Path(folder)), \
             patch.dict(os.environ, {'EA888_KEYSTORE_B64': 'another-key'}):
            with self.assertRaisesRegex(SystemExit, 'Cannot read existing signing metadata'):
                build.signing_env(local_signing=True)


if __name__ == '__main__':
    unittest.main()
