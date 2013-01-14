import mock
import os, shutil
import sys
import tempfile
from pyramid.compat import NativeIO
from pyramid_amdjs import script as amd
from pyramid_amdjs.amd import ID_AMD_MODULE, ID_AMD_SPEC

from base import BaseTestCase


class TestAmdCommand(BaseTestCase):

    @mock.patch('pyramid_amdjs.script.bootstrap')
    def test_no_params(self, m_bs):
        m_bs.return_value = {'registry': self.registry, 'request': self.request}

        sys.argv[:] = ['amdjs', 'pyramid_amdjs.ini']

        stdout = sys.stdout
        out = NativeIO()
        sys.stdout = out

        amd.main()
        sys.stdout = stdout

        val = out.getvalue()

        self.assertIn('[-h] [-b] [-m] [--deps] [--no-min] config', val)

    @mock.patch('pyramid_amdjs.script.bootstrap')
    def test_list_modules(self, m_bs):
        m_bs.return_value = {'registry': self.registry, 'request': self.request}

        self.config.add_amd_js(
            'test', 'pyramid_amdjs:tests/dir/test.js', 'Test module')

        sys.argv[1:] = ['-m', 'pyramid_amdjs.ini']

        stdout = sys.stdout
        out = NativeIO()
        sys.stdout = out

        amd.main()
        sys.stdout = stdout

        val = out.getvalue()

        self.assertIn('* test: pyramid_amdjs:tests/dir/test.js', val)
        self.assertIn('Test module', val)

    @mock.patch('pyramid_amdjs.script.build_init')
    @mock.patch('pyramid_amdjs.script.bootstrap')
    def test_build_bundle(self, m_bs, m_binit):
        m_bs.return_value = {'registry': self.registry, 'request': self.request}
        m_binit.return_value = '123'

        self.config.add_amd_js(
            'test', 'pyramid_amdjs:tests/dir/test.js', 'Test module')
        self.config.add_handlebars_bundle(
            'mustache-test', 'pyramid_amdjs:tests/dir/', 'Mustache bundle')

        cfg = self.registry.settings

        sys.argv[1:] = ['-b', 'pyramid_amdjs.ini']

        stdout = sys.stdout

        out = NativeIO()
        sys.stdout = out
        amd.main()
        sys.stdout = stdout

        val = out.getvalue()

        self.assertIn('Spec files are not specified in .ini file', val)

        cfg['amd.spec'] = [('main', 'pyramid_amdjs:tests/amd.spec')]

        out = NativeIO()
        sys.stdout = out
        amd.main()
        sys.stdout = stdout
        val = out.getvalue()

        self.assertIn('Destination directory is not specified in .ini file',val)

        d = tempfile.mkdtemp()
        cfg['amd.spec-dir'] = d

        out = NativeIO()
        sys.stdout = out
        amd.main()
        sys.stdout = stdout
        val = out.getvalue()

        self.assertIn('Processing: main (pyramid_amdjs:tests/amd.spec)',val)
        self.assertIn("""
* bundle.js
    test: pyramid_amdjs:tests/dir/test.js
    mustache-test: templates bundle""", val)
        self.assertTrue(os.path.isfile(os.path.join(d, 'bundle.js')))
        self.assertFalse(os.path.isfile(os.path.join(d, 'bundle2.js')))
        self.assertTrue(os.path.isfile(os.path.join(d, 'init-main.js')))

        shutil.rmtree(d)

        d = tempfile.mkdtemp()
        cfg['amd.spec-dir'] = d

        sys.argv[1:] = ['-b', '--no-min', 'pyramid_amdjs.ini']

        out = NativeIO()
        sys.stdout = out
        amd.main()
        sys.stdout = stdout
        val = out.getvalue()

        self.assertIn('Processing: main (pyramid_amdjs:tests/amd.spec)',val)
        self.assertIn("""
* bundle.js
    test: pyramid_amdjs:tests/dir/test.js
    mustache-test: templates bundle""", val)
        self.assertTrue(os.path.isfile(os.path.join(d, 'bundle.js')))

        shutil.rmtree(d)

    @mock.patch('pyramid_amdjs.script.bootstrap')
    def test_extract_deps(self, m_bs):
        m_bs.return_value = {'registry': self.registry, 'request': self.request}
        sys.argv[1:] = ['-b', '--no-min', 'pyramid_amdjs.ini']

        args = amd.AmdjsCommand.parser.parse_args()
        cmd = amd.AmdjsCommand(args)

        self.assertEqual(
            ['jca'],
            cmd.extract_deps({'path': 'pyramid_amdjs:tests/dir/test.js'}))

        self.assertEqual(
            ['jca'],
            cmd.extract_deps({'path': '', 'requires': ['jca']}))

    @mock.patch('pyramid_amdjs.script.bootstrap')
    def test_build_tree(self, m_bs):
        m_bs.return_value = {'registry': self.registry, 'request': self.request}
        sys.argv[1:] = ['--deps', 'pyramid_amdjs.ini']

        self.registry[ID_AMD_MODULE] = {
            'test': {'path': 'pyramid_amdjs:tests/dir/test.js'}}

        self.registry[ID_AMD_SPEC] = {'test': {'test': {}}}

        out = NativeIO()
        stdout = sys.stdout
        sys.stdout = out
        amd.main()
        sys.stdout = stdout
        val = out.getvalue()

        self.assertIn('* Spec: test', val)
        self.assertIn('jca', val)
        self.assertIn('test', val)
