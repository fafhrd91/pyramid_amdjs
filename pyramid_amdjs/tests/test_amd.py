import os, tempfile
from pyramid.path import AssetResolver
from pyramid.config import Configurator
from pyramid.compat import binary_type, text_type, bytes_
from pyramid.response import FileResponse
from pyramid.exceptions import ConfigurationError, ConfigurationConflictError
from pyramid.httpexceptions import HTTPNotFound

from base import BaseTestCase


class TestAmdDirective(BaseTestCase):

    _include = False

    def test_amd_directive(self):
        self.assertFalse(hasattr(self.config, 'add_amd_js'))
        self.assertFalse(hasattr(self.config, 'add_amd_css'))
        self.config.include('pyramid_amdjs')

        self.assertTrue(hasattr(self.config, 'add_amd_js'))
        self.assertTrue(hasattr(self.config, 'add_amd_css'))


class TestAmd(BaseTestCase):

    _auto_include = False

    def test_js_registration(self):
        from pyramid_amdjs.amd import ID_AMD_MODULE, JS_MOD

        self.config.add_amd_js(
            'test', 'pyramid_amdjs:tests/dir/test.js')
        self.config.commit()

        data = self.registry.get(ID_AMD_MODULE)
        self.assertIn('test', data)
        self.assertEqual(data['test']['path'], 
                         'pyramid_amdjs:tests/dir/test.js')
        self.assertEqual(data['test']['tp'], JS_MOD)

    def test_css_registration(self):
        from pyramid_amdjs.amd import ID_AMD_MODULE, CSS_MOD

        self.config.add_amd_css(
            'test', 'pyramid_amdjs:tests/dir/test3.css')
        self.config.commit()

        data = self.registry.get(ID_AMD_MODULE)
        self.assertIn('test', data)
        self.assertEqual(data['test']['path'], 
                         'pyramid_amdjs:tests/dir/test3.css')
        self.assertEqual(data['test']['tp'], CSS_MOD)

    def test_js_registration_with_require(self):
        from pyramid_amdjs.amd import ID_AMD_MODULE

        self.config.add_amd_js(
            'test', 'pyramid_amdjs:tests/dir/test.js', require='test2')
        self.config.commit()

        data = self.registry.get(ID_AMD_MODULE)
        self.assertEqual(data['test']['require'], ('test2',))

    def test_reg_conflict(self):
        self.config.commit()

        self.config.add_amd_js(
            'test', 'pyramid_amdjs:tests/dir/test1.js')
        self.config.add_amd_js(
            'test', 'pyramid_amdjs:tests/dir/test2.js')

        self.assertRaises(
            ConfigurationConflictError, self.config.commit)

    def test_amd_dir(self):
        from pyramid_amdjs.amd import ID_AMD_MODULE

        self.config.add_amd_dir('pyramid_amdjs:tests/dir/')
        self.config.commit()

        data = self.registry.get(ID_AMD_MODULE)
        self.assertEqual(data['jca-globals']['path'], 
                         'pyramid_amdjs:tests/dir/test.js')


class TestAmdSpec(BaseTestCase):

    def test_unknown_spec(self):
        from pyramid_amdjs.amd import amd_spec, ID_AMD_SPEC

        self.request.matchdict['name'] = 'test.js'
        self.request.matchdict['specname'] = 'test'

        self.assertIsInstance(amd_spec(self.request), HTTPNotFound)

    def test_spec_without_path(self):
        from pyramid_amdjs.amd import amd_spec, ID_AMD_SPEC

        self.request.matchdict['name'] = 'test.js'
        self.request.matchdict['specname'] = 'test'

        self.registry[ID_AMD_SPEC] = {'test': {'test.js': {'url':'http://...'}}}
        self.assertIsInstance(amd_spec(self.request), HTTPNotFound)

    def test_spec(self):
        from pyramid_amdjs.amd import amd_spec, ID_AMD_SPEC

        self.request.matchdict['name'] = 'test.js'
        self.request.matchdict['specname'] = 'test'

        resolver = AssetResolver()
        path = resolver.resolve('pyramid_amdjs:tests/dir/test.js').abspath()

        self.registry[ID_AMD_SPEC] = {'test': {'test.js': {'path':path}}}
        self.assertIsInstance(amd_spec(self.request), FileResponse)


class TestAmdInit(BaseTestCase):

    def setUp(self):
        super(TestAmdInit, self).setUp()

        self.registry.settings['amd.enabled'] = True
        self.config.add_static_view('_tests', 'pyramid_amdjs:tests/dir/')

    def test_amd_init_no_spec(self):
        from pyramid_amdjs.amd import amd_init

        self.config.add_amd_js(
            'test-mod', 'pyramid_amdjs:tests/dir/test.js')

        self.request.matchdict['specname'] = 'unknown'

        resp = amd_init(self.request)
        self.assertIsInstance(resp, HTTPNotFound)

    def test_amd_init_with_spec_url(self):
        from pyramid_amdjs.amd import JS_MOD
        from pyramid_amdjs.amd import amd_init, ID_AMD_MODULE, ID_AMD_SPEC

        self.registry[ID_AMD_MODULE] = {
            'pyramid': {'path':'pyramid_amdjs:static/pyramid_amdjs.js',
                        'tp': JS_MOD}}
        self.registry[ID_AMD_SPEC] = \
            {'test': {'pyramid': {'url': 'http://test.com/example.js'}}}

        self.request.matchdict['specname'] = 'test'

        resp = amd_init(self.request)
        self.assertEqual(resp.status, '200 OK')

        self.registry[ID_AMD_SPEC] = \
            {'test': {'pyramid': {'name':'test', 
                                  'path':'pyramid_amdjs:static/example.js'}}}
        resp = amd_init(self.request)
        self.assertIn('"pyramid": "http://example.com/_amd_test/test"', resp.text)

    def test_amd_init_with_spec_mustache(self):
        from pyramid_amdjs.amd import amd_init, ID_AMD_MODULE, ID_AMD_SPEC

        self.request.matchdict['specname'] = 'test'
        self.request.registry = self.registry
        self.registry[ID_AMD_SPEC] = {
            'test': {'underscore':
                     {'name':'test', 
                      'path':'pyramid_amdjs:static/example.js'}}
        }
        resp = amd_init(self.request)
        self.assertIn(
            '"underscore": "http://example.com/_amd_test/test"', resp.text)

    def test_amd_mod_paths(self):
        from pyramid_amdjs.amd import amd_init

        self.config.add_amd_js(
            'test-mod', 'pyramid_amdjs:tests/dir/test.js')
        self.config.add_amd_css(
            'test-css', 'pyramid_amdjs:tests/dir/test3.css')
        
        self.request.matchdict['specname'] = '_'

        resp = amd_init(self.request)
        self.assertIn('var pyramid_amd_modules = {', resp.text)
        self.assertIn(
            '"test-mod": "http://example.com/_tests/test.js"', resp.text)
        self.assertIn(
            '"test-css.css": "http://example.com/_tests/test3.css"', resp.text)


class TestInitAmdSpec(BaseTestCase):

    def setUp(self):
        self._files = []
        super(TestInitAmdSpec, self).setUp()

    def _create_file(self, text):
        d, fn = tempfile.mkstemp()
        self._files.append(fn)
        with open(fn, 'wb') as f:
            f.write(bytes_(text, 'utf-8'))

        return fn

    def tearDown(self):
        for f in self._files:
            os.unlink(f)

        super(TestInitAmdSpec, self).tearDown()

    def test_empty_spec(self):
        fn = self._create_file("[test.js]\nmodules = lib1")

        cfg = self.registry.settings
        cfg['amd.spec'] = ''

        from pyramid_amdjs.amd import init_amd_spec, ID_AMD_SPEC

        # no amd-spec-dir
        init_amd_spec(self.config)

        storage = self.registry[ID_AMD_SPEC]
        self.assertEqual(storage, {})

    def test_empty_dir(self):
        fn = self._create_file("[test.js]\nmodules = lib1")

        cfg = self.registry.settings
        cfg['amd.spec'] = ['%s'%fn, 'test:%s'%fn]

        from pyramid_amdjs.amd import init_amd_spec, ID_AMD_SPEC

        # no amd-spec-dir
        self.assertRaises(ConfigurationError, init_amd_spec, self.config)

    def test_simple(self):
        fn = self._create_file("[test.js]\nmodules = lib1")

        cfg = self.registry.settings
        cfg['amd.spec'] = ['%s'%fn, 'test:%s'%fn]
        cfg['amd.spec-dir'] = '/test'

        from pyramid_amdjs.amd import init_amd_spec, ID_AMD_SPEC
        init_amd_spec(self.config)

        storage = self.registry[ID_AMD_SPEC]
        self.assertIn('', storage)
        self.assertTrue(storage['']['test.js']['path'].endswith('/test.js'))
        self.assertIn('test', storage)

    def test_bundle_with_url(self):
        fn = self._create_file(
            "[test.js]\nurl=http://example.com/test.js\nmodules = lib1")

        cfg = self.registry.settings
        cfg['amd.spec'] = [fn]
        cfg['amd.spec-dir'] = '/test'

        from pyramid_amdjs.amd import init_amd_spec, ID_AMD_SPEC
        init_amd_spec(self.config)

        storage = self.registry[ID_AMD_SPEC]
        self.assertIn('url', storage['']['test.js'])
        self.assertEqual(storage['']['test.js']['url'],
                         'http://example.com/test.js')

    text1 = """
[test.js]
modules = lib1

[test.js]
modules = lib2
"""

    def test_multple_bundles(self):
        fn = self._create_file(self.text1)

        cfg = self.registry.settings
        cfg['amd.spec'] = ['test:%s'%fn, 'test:%s'%fn]
        cfg['amd.spec-dir'] = '/unknown'

        from pyramid_amdjs.amd import init_amd_spec
        self.assertRaises(ConfigurationError, init_amd_spec, self.config)


class TestRequestRenderers(BaseTestCase):

    def setUp(self):
        super(TestRequestRenderers, self).setUp()

        self.cfg = self.registry.settings

        from pyramid.interfaces import IRequestExtensions
        extensions = self.registry.getUtility(IRequestExtensions)
        self.request._set_extensions(extensions)

    def make_request(self):
        from pyramid.request import Request
        return Request(environ=self._environ)

    def test_render_js_includes(self):
        self.cfg['amd.enabled'] = False

        text = self.request.include_amd_js().strip()
        self.assertEqual(
            text, '<script src="http://example.com/_amdjs/static/lib/curl.js"> </script>\n<script src="http://example.com/_amd__.js"> </script>')

        text = self.request.include_amd_js('test-spec').strip()
        self.assertIn(
            '<script src="http://example.com/_amd__.js"> </script>', text)

    def test_render_css_includes(self):
        text = self.request.include_amd_css('test-css').strip()
        self.assertIn(
            "curl(['css!test-css.css'],{paths:pyramid_amd_modules})", text)

    def test_render_js_includes_unknown_spec(self):
        self.cfg['amd.enabled'] = True

        self.assertRaises(
            RuntimeError, self.request.include_amd_js, 'unknown')
        self.assertRaises(
            RuntimeError, self.request.include_amd_js, 'spec')

    def test_render_js_includes_default(self):
        self.cfg['amd.enabled'] = True

        text = self.request.include_amd_js().strip()
        self.assertEqual(
            text, '<script src="http://example.com/_amdjs/static/lib/curl.js"> </script>\n<script src="http://example.com/_amd__.js"> </script>')

    def test_render_amd_includes_spec(self):
        from pyramid_amdjs.amd import ID_AMD_SPEC

        self.cfg['amd.enabled'] = True

        self.registry[ID_AMD_SPEC] = {'test':
                                      {'test.js': {'path':'/test/test.js'}}}

        text = self.request.include_amd_js('test').strip()
        self.assertIn(
            '<script src="http://example.com/_amd_test.js"> </script>', text)

        text = self.request.include_amd_js('test', 'test').strip()
        self.assertIn(
            '<script src="http://example.com/_amd_test.js"> </script>\n<script src="http://example.com/_amd_test/test.js"></script>', text)
