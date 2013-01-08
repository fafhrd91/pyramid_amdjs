""" Tests for pyramid_amdjs.amddebug """
import mock
from pyramid_amdjs import amd, amddebug

from base import BaseTestCase


class TestAmdDirective(BaseTestCase):

    _settings = {'amd.debug': True}
    _include = False

    def test_amd_directive(self):
        self.config.include('pyramid_amdjs')

        self.assertEqual(
            'pyramid_amdjs.amddebug',
            self.config.add_amd_dir.__func__.__module__)

        self.assertEqual(
            'pyramid_amdjs.amddebug',
            self.registry[amd.ID_AMD_BUILD].__module__)

        self.assertEqual(
            'pyramid_amdjs.amddebug',
            self.registry[amd.ID_AMD_BUILD_MD5].__module__)

    def test_add_amd_dir(self):
        self.config.include('pyramid_amdjs')

        self.config.add_amd_dir('pyramid_amdjs:tests/dir/')

        path = amd.RESOLVER.resolve('pyramid_amdjs:tests/dir/').abspath()

        self.assertEqual(
            [('pyramid_amdjs:tests/dir/',path)],
            self.registry.settings['amd.debug.data']['paths'])


class TestBuildInit(BaseTestCase):

    _settings = {'amd.debug': True}

    @mock.patch('pyramid_amdjs.amddebug.build_init')
    def test_build_md5(self, m_binit):
        m_binit.return_value = '123'

        self.assertEqual(
            '202cb962ac59075b964b07152d234b70',
            amddebug.build_md5(self.request, '_'))

    @mock.patch('pyramid_amdjs.amddebug.amd')
    def test_build_init(self, m_amd):
        m_amd.build_init.return_value = '123'
        m_amd.extract_mod = amd.extract_mod

        self.config.add_static_view('_tests', 'pyramid_amdjs:tests/dir/')
        self.config.add_amd_dir('pyramid_amdjs:tests/dir/')

        res = amddebug.build_init(self.request, 'test')
        self.assertEqual('123', res)
        self.assertTrue(m_amd.build_init.called)

        mods = m_amd.build_init.call_args[0][2]
        self.assertIn(
            '"test3.css": "/_tests/test3.css?_v=6305443b362b239fad70ffc6d59c98df"',
            mods)

        self.assertIn(
            '"jca-globals": "/_tests/test.js?_v=4ce2ec81952ee8e6d0058334361babbe"',
            mods)
