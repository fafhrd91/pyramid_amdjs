import sys
from pyramid import testing
from pyramid.interfaces import IRequest
from pyramid.interfaces import IRouteRequest
from pyramid.interfaces import IRequestExtensions

if sys.version_info[:2] == (2, 6):
    from unittest2 import TestCase
    TestCase
else:
    from unittest import TestCase


class BaseTestCase(TestCase):

    _include = True
    _auto_include = True
    _settings = {'amd.debug': 'f'}
    _environ = {
        'wsgi.url_scheme':'http',
        'wsgi.version':(1,0),
        'HTTP_HOST': 'example.com',
        'SCRIPT_NAME': '',
        'PATH_INFO': '/'}

    def setUp(self):
        self.init_pyramid()

    def make_request(self, environ=None, **kwargs):
        if environ is None:
            environ=self._environ
        request = testing.DummyRequest(environ=dict(environ), **kwargs)
        request.request_iface = IRequest
        request.registry = self.registry
        request._set_extensions(self.registry.getUtility(IRequestExtensions))
        return request

    def init_request_extensions(self, registry):
        from pyramid.config.factories import _RequestExtensions

        exts = registry.queryUtility(IRequestExtensions)
        if exts is None:
            exts = _RequestExtensions()
            registry.registerUtility(exts, IRequestExtensions)

    def init_pyramid(self):
        self.config = testing.setUp(
            settings=self._settings, autocommit=self._auto_include)
        self.config.get_routes_mapper()
        self.init_request_extensions(self.config.registry)
        self.registry = self.config.registry
        self.request = request = self.make_request()
        self.request.registry = self.registry

        if self._include:
            self.config.include('pyramid_amdjs')

        def set_ext():
            self.request._set_extensions(
                self.registry.getUtility(IRequestExtensions))

        self.config.action(id(self), callable=set_ext)
        self.config.begin(self.request)
