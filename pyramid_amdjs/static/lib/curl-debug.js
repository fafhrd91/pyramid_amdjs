/** @license MIT License (c) copyright B Cavalier & J Hann */

/**
 * curl (cujo resource loader)
 * An AMD-compliant javascript module and resource loader
 *
 * curl is part of the cujo.js family of libraries (http://cujojs.com/)
 *
 * Licensed under the MIT License at:
 *                 http://www.opensource.org/licenses/mit-license.php
 *
 */
(function (global) {
//"use strict"; don't restore this until the config routine is refactored
        var
                version = '0.7.1',
                curlName = 'curl',
                userCfg,
                prevCurl,
                define,
                doc = global.document,
                head = doc && (doc['head'] || doc.getElementsByTagName('head')[0]),
                // to keep IE from crying, we need to put scripts before any
                // <base> elements, but after any <meta>. this should do it:
                insertBeforeEl = head && head.getElementsByTagName('base')[0] || null,
                // constants / flags
                msgUsingExports = {},
                msgFactoryExecuted = {},
                // this is the list of scripts that IE is loading. one of these will
                // be the "interactive" script. too bad IE doesn't send a readystatechange
                // event to tell us exactly which one.
                activeScripts = {},
                // readyStates for IE6-9
                readyStates = 'addEventListener' in global ? {} : { 'loaded': 1, 'complete': 1 },
                // these are always handy :)
                cleanPrototype = {},
                toString = cleanPrototype.toString,
                undef,
                // local cache of resource definitions (lightweight promises)
                cache = {},
                // preload are files that must be loaded before any others
                preload = false,
                // net to catch anonymous define calls' arguments (non-IE browsers)
                argsNet,
                // RegExp's used later, pre-compiled here
                dontAddExtRx = /\?/,
                absUrlRx = /^\/|^[^:]+:\/\//,
                findDotsRx = /(\.)(\.?)(?:$|\/([^\.\/]+.*)?)/g,
                removeCommentsRx = /\/\*[\s\S]*?\*\/|(?:[^\\])\/\/.*?[\n\r]/g,
                findRValueRequiresRx = /require\s*\(\s*["']([^"']+)["']\s*\)|(?:[^\\]?)(["'])/g,
                cjsGetters,
                core;

        function noop () {}

        function isType (obj, type) {
                return toString.call(obj).indexOf('[object ' + type) == 0;
        }

        function normalizePkgDescriptor (descriptor) {
                var main;

                descriptor.path = removeEndSlash(descriptor['path'] || descriptor['location'] || '');
                main = descriptor['main'] || './main';
                if (!isRelUrl(main)) main = './' + main;
                // trailing slashes trick reduceLeadingDots to see them as base ids
                descriptor.main = reduceLeadingDots(main, descriptor.name + '/');
                //if (isRelUrl(descriptor.main)) throw new Error('invalid main (' + main + ') in ' + descriptor.name);
                descriptor.config = descriptor['config'];

                return descriptor;
        }

        function isRelUrl (it) {
                return it.charAt(0) == '.';
        }

        function isAbsUrl (it) {
                return absUrlRx.test(it);
        }

        function joinPath (path, file) {
                return removeEndSlash(path) + '/' + file;
        }

        function removeEndSlash (path) {
                return path && path.charAt(path.length - 1) == '/' ? path.substr(0, path.length - 1) : path;
        }

        function reduceLeadingDots (childId, baseId) {
                // this algorithm is similar to dojo's compactPath, which interprets
                // module ids of "." and ".." as meaning "grab the module whose name is
                // the same as my folder or parent folder".  These special module ids
                // are not included in the AMD spec but seem to work in node.js, too.
                var removeLevels, normId, levels, isRelative, diff;

                removeLevels = 1;
                normId = childId;

                // remove leading dots and count levels
                if (isRelUrl(normId)) {
                        isRelative = true;
                        normId = normId.replace(findDotsRx, function (m, dot, doubleDot, remainder) {
                                if (doubleDot) removeLevels++;
                                return remainder || '';
                        });
                }

                if (isRelative) {
                        levels = baseId.split('/');
                        diff = levels.length - removeLevels;
                        if (diff < 0) {
                                // this is an attempt to navigate above parent module.
                                // maybe dev wants a url or something. punt and return url;
                                return childId;
                        }
                        levels.splice(diff, removeLevels);
                        // normId || [] prevents concat from adding extra "/" when
                        // normId is reduced to a blank string
                        return levels.concat(normId || []).join('/');
                }
                else {
                        return normId;
                }
        }

        function pluginParts (id) {
                var delPos = id.indexOf('!');
                return {
                        resourceId: id.substr(delPos + 1),
                        // resourceId can be zero length
                        pluginId: delPos >= 0 && id.substr(0, delPos)
                };
        }

        function Begetter () {}

        function beget (parent, mixin) {
                Begetter.prototype = parent || cleanPrototype;
                var child = new Begetter();
                Begetter.prototype = cleanPrototype;
                for (var p in mixin) child[p] = mixin[p];
                return child;
        }

        function Promise () {

                var self, thens, complete;

                self = this;
                thens = [];

                function then (resolved, rejected, progressed) {
                        // capture calls to callbacks
                        thens.push([resolved, rejected, progressed]);
                }

                function notify (which, arg) {
                        // complete all callbacks
                        var aThen, cb, i = 0;
                        while ((aThen = thens[i++])) {
                                cb = aThen[which];
                                if (cb) cb(arg);
                        }
                }

                complete = function promiseComplete (success, arg) {
                        // switch over to sync then()
                        then = success ?
                                function (resolved, rejected) { resolved && resolved(arg); } :
                                function (resolved, rejected) { rejected && rejected(arg); };
                        // we no longer throw during multiple calls to resolve or reject
                        // since we don't really provide useful information anyways.
                        complete = noop;
                        // complete all callbacks
                        notify(success ? 0 : 1, arg);
                        // no more notifications
                        notify = noop;
                        // release memory
                        thens = undef;
                };

                this.then = function (resolved, rejected, progressed) {
                        then(resolved, rejected, progressed);
                        return self;
                };
                this.resolve = function (val) {
                        self.resolved = val;
                        complete(true, val);
                };
                this.reject = function (ex) {
                        self.rejected = ex;
                        complete(false, ex);
                };
                this.progress = function (msg) {
                        notify(2, msg);
                }

        }

        function isPromise (o) {
                return o instanceof Promise;
        }

        function when (promiseOrValue, callback, errback, progback) {
                // we can't just sniff for then(). if we do, resources that have a
                // then() method will make dependencies wait!
                if (isPromise(promiseOrValue)) {
                        return promiseOrValue.then(callback, errback, progback);
                }
                else {
                        return callback(promiseOrValue);
                }
        }

        /**
         * Returns a function that when executed, executes a lambda function,
         * but only executes it the number of times stated by howMany.
         * When done executing, it executes the completed function. Each callback
         * function receives the same parameters that are supplied to the
         * returned function each time it executes.  In other words, they
         * are passed through.
         * @private
         * @param howMany {Number} must be greater than zero
         * @param lambda {Function} executed each time
         * @param completed {Function} only executes once when the counter
         *   reaches zero
         * @returns {Function}
         */
        function countdown (howMany, lambda, completed) {
                var result;
                return function () {
                        if (--howMany >= 0 && lambda) result = lambda.apply(undef, arguments);
                        // we want ==, not <=, since some callers expect call-once functionality
                        if (howMany == 0 && completed) completed(result);
                        return result;
                }
        }

        core = {

                /**
                 * * reduceLeadingDots of id against parentId
                 *                - if there are too many dots (path goes beyond parent), it's a url
                 *                        - return reduceLeadingDots of id against baseUrl + parentId;
                 *        * if id is a url (starts with dots or slash or protocol)
                 *                - pathInfo = { config: userCfg, url: url }
                 *        * if not a url, id-to-id transform here.
                 *                - main module expansion
                 *                - plugin prefix expansion
                 *                - coordinate main module expansion with plugin expansion
                 *                        - main module expansion happens first
                 *                - future: other transforms?
                 * @param id
                 * @param parentId
                 * @param cfg
                 * @return {*}
                 */
                toAbsId: function (id, parentId, cfg) {
                        var absId, pluginId, parts;

                        absId = reduceLeadingDots(id, parentId);

                        // if this is still a relative path, it must be a url
                        // so just punt, otherwise...
                        if (isRelUrl(absId)) return absId;

                        // plugin id split
                        parts = pluginParts(absId);
                        pluginId = parts.pluginId;
                        absId = pluginId || parts.resourceId;

                        // main id expansion
                        if (absId in cfg.pathMap) {
                                absId = cfg.pathMap[absId].main || absId;
                        }

                        // plugin id expansion
                        if (pluginId) {
                                if (pluginId.indexOf('/') < 0 && !(pluginId in cfg.pathMap)) {
                                        absId = joinPath(cfg.pluginPath, pluginId);
                                }
                                absId = absId + '!' + parts.resourceId;
                        }

                        return absId;
                },

                createContext: function (cfg, baseId, depNames, isPreload) {

                        var def;

                        def = new Promise();
                        def.id = baseId || ''; // '' == global
                        def.isPreload = isPreload;
                        def.depNames = depNames;
                        def.config = cfg;

                        // functions that dependencies will use:

                        function toAbsId (childId) {
                                return core.toAbsId(childId, def.id, cfg);
                        }

                        function toUrl (n) {
                                // the AMD spec states that we should not append an extension
                                // in this function since it could already be appended.
                                // we need to use toAbsId in case this is a module id.
                                return core.resolvePathInfo(toAbsId(n), cfg).url;
                        }

                        function localRequire (ids, callback, errback) {
                                var cb, rvid, childDef, earlyExport;

                                // this is public, so send pure function
                                // also fixes issue #41
                                cb = callback && function () { callback.apply(undef, arguments[0]); };

                                // RValue require (CommonJS)
                                if (isType(ids, 'String')) {
                                        if (cb) {
                                                throw new Error('require(id, callback) not allowed');
                                        }
                                        // return resource
                                        rvid = toAbsId(ids);
                                        childDef = cache[rvid];
                                        if (!(rvid in cache)) {
                                                // this should only happen when devs attempt their own
                                                // manual wrapping of cjs modules or get confused with
                                                // the callback syntax:
                                                throw new Error('Module not resolved: '  + rvid);
                                        }
                                        earlyExport = isPromise(childDef) && childDef.exports;
                                        return earlyExport || childDef;
                                }
                                else {
                                        when(core.getDeps(core.createContext(cfg, def.id, ids, isPreload)), cb, errback);
                                }
                        }

                        def.require = localRequire;
                        localRequire['toUrl'] = toUrl;
                        def.toAbsId = toAbsId;

                        return def;
                },

                createResourceDef: function (cfg, id, isPreload) {
                        var def, origResolve, execute;

                        def = core.createContext(cfg, id, undef, isPreload);
                        origResolve = def.resolve;

                        // using countdown to only execute definition function once
                        execute = countdown(1, function (deps) {
                                def.deps = deps;
                                try {
                                        return core.executeDefFunc(def);
                                }
                                catch (ex) {
                                        def.reject(ex);
                                }
                        });

                        // intercept resolve function to execute definition function
                        // before resolving
                        def.resolve = function resolve (deps) {
                                when(isPreload || preload, function () {
                                        origResolve((cache[def.id] = execute(deps)));
                                });
                        };

                        // track exports
                        def.exportsReady = function executeFactory (deps) {
                                when(isPreload || preload, function () {
                                        // only resolve early if we also use exports (to avoid
                                        // circular dependencies). def.exports will have already
                                        // been set by the getDeps loop before we get here.
                                        if (def.exports) {
                                                execute(deps);
                                                def.progress(msgFactoryExecuted);
                                        }
                                });
                        };

                        return def;
                },

                createPluginDef: function (cfg, id, resId, isPreload) {
                        var def;

                        // use resource id for local require and toAbsId
                        def = core.createContext(cfg, resId, undef, isPreload);

                        return def;
                },

                getCjsRequire: function (def) {
                        return def.require;
                },

                getCjsExports: function (def) {
                        return def.exports || (def.exports = {});
                },

                getCjsModule: function (def) {
                        var module = def.module;
                        if (!module) {
                                module = def.module = {
                                        'id': def.id,
                                        'uri': core.getDefUrl(def),
                                        'exports': core.getCjsExports(def),
                                        'config': function () { return def.config; }
                                };
                                module.exports = module['exports']; // oh closure compiler!
                        }
                        return module;
                },

                getDefUrl: function (def) {
                        // note: this is used by cjs module.uri
                        return def.url || (def.url = core.checkToAddJsExt(def.require['toUrl'](def.id), def.config));
                },

                config: function (cfg) {
                        var setDefaults, defineName, failMsg, okToOverwrite,
                                apiName, apiContext, apiObj,
                                defName, defContext, defObj;

                        // no config was specified, yet
                        setDefaults = !cfg;

                        // switch to re-runnable config
                        if (cfg) core.config = core.moreConfig;

                        defineName = 'define';
                        failMsg = ' already exists';

                        if (!cfg) cfg = {};

                        // allow dev to rename/relocate curl() to another object
                        apiName = cfg['apiName'] || curlName;
                        apiContext = cfg['apiContext'];
                        apiObj = apiContext || global;
                        defName = cfg['defineName'] || defineName;
                        defContext = cfg['defineContext'];
                        defObj = defContext || global;

                        // is it ok to overwrite an existing api functions?
                        okToOverwrite = cfg['overwriteApi'];

                        // restore previous (global) curl, if it was blown away
                        // by us. this can happen when configuring curl's api
                        // after loading it. do this before any throws below.
                        if (!setDefaults && prevCurl) {
                                global[curlName] = prevCurl;
                                prevCurl = false;
                        }

                        // only throw if we're overwriting curl accidentally and this
                        // isn't a setDefaults pass. (see else)
                        if (!setDefaults && !okToOverwrite && apiObj[apiName] && apiObj[apiName] != _curl) {
                                throw new Error(apiName + failMsg);
                        }
                        else {
                                // if setDefaults, we must overwrite curl so that dev can
                                // configure it. (in this case, the following is the same as
                                // global.curl = _curl;)
                                apiObj[apiName] = _curl;
                        }

                        // if setDefaults, only create define() if it doesn't already exist.
                        if (!(setDefaults && global[defineName])) {
                                if (!setDefaults && !okToOverwrite && defName in defObj && defObj[defName] != define) {
                                        throw new Error(defName + failMsg);
                                }
                                else {
                                        // create AMD public api: define()
                                        defObj[defName] = define = function () {
                                                // wrap inner _define so it can be replaced without losing define.amd
                                                var args = core.fixArgs(arguments);
                                                _define(args);
                                        };
                                }
                                // indicate our capabilities:
                                define['amd'] = { 'plugins': true, 'jQuery': true, 'curl': version };
                        }

                        return core.moreConfig(cfg);
                },

                moreConfig: function (cfg, prevCfg) {
                        var newCfg, pluginCfgs, p, absId;

                        if (!prevCfg) prevCfg = {};
                        newCfg = beget(prevCfg, cfg);

                        // set defaults and convert from closure-safe names
                        newCfg.baseUrl = newCfg['baseUrl'] || '';
                        newCfg.pluginPath = newCfg['pluginPath'] || 'curl/plugin';
                        newCfg.dontAddFileExt = new RegExp(newCfg['dontAddFileExt'] || dontAddExtRx);

                        // create object to hold path map.
                        // each plugin and package will have its own pathMap, too.
                        newCfg.pathMap = beget(prevCfg.pathMap);
                        pluginCfgs = cfg['plugins'] || {};
                        newCfg.plugins = beget(prevCfg.plugins);

                        // temporary arrays of paths. this will be converted to
                        // a regexp for fast path parsing.
                        newCfg.pathList = [];

                        // normalizes path/package info and places info on either
                        // the global cfg.pathMap or on a plugin-specific altCfg.pathMap.
                        // also populates a pathList on cfg or plugin configs.
                        function fixAndPushPaths (coll, isPkg) {
                                var id, pluginId, data, parts, currCfg, info;
                                for (var name in coll) {
                                        data = coll[name];
                                        if (isType(data, 'String')) data = {
                                                path: coll[name]
                                        };
                                        // grab the package id, if specified. default to
                                        // property name, if missing.
                                        data.name = data['name'] || name;
                                        currCfg = newCfg;
                                        // check if this is a plugin-specific path
                                        parts = pluginParts(removeEndSlash(core.toAbsId(data.name, '', newCfg)));
                                        id = parts.resourceId;
                                        pluginId = parts.pluginId;
                                        if (pluginId) {
                                                // plugin-specific path
                                                currCfg = pluginCfgs[pluginId];
                                                if (!currCfg) {
                                                        currCfg = pluginCfgs[pluginId] = beget(newCfg);
                                                        currCfg.pathMap = beget(newCfg.pathMap);
                                                        currCfg.pathList = [];
                                                }
                                                // remove plugin-specific path from coll
                                                delete coll[name];
                                        }
                                        if (isPkg) {
                                                info = normalizePkgDescriptor(data);
                                                if (info.config) info.config = beget(newCfg, info.config);
                                        }
                                        else {
                                                info = { path: removeEndSlash(data.path) };
                                        }
                                        info.specificity = id.split('/').length;
                                        if (id) {
                                                currCfg.pathMap[id] = info;
                                                currCfg.pathList.push(id);
                                        }
                                        else {
                                                // naked plugin name signifies baseUrl for plugin
                                                // resources. baseUrl could be relative to global
                                                // baseUrl.
                                                currCfg.baseUrl = core.resolveUrl(data.path, newCfg);
                                        }
                                }
                        }

                        // adds the path matching regexp onto the cfg or plugin cfgs.
                        function convertPathMatcher (cfg) {
                                var pathMap = cfg.pathMap;
                                cfg.pathRx = new RegExp('^(' +
                                        cfg.pathList.sort(function (a, b) { return pathMap[b].specificity - pathMap[a].specificity; } )
                                                .join('|')
                                                .replace(/\/|\./g, '\\$&') +
                                        ')(?=\\/|$)'
                                );
                                delete cfg.pathList;
                        }

                        // fix all new packages, then paths (in case there are
                        // plugin-specific paths for a main module, such as wire!)
                        fixAndPushPaths(cfg['packages'], true);
                        fixAndPushPaths(cfg['paths'], false);

                        // process plugins after packages in case we already perform an
                        // id transform on a plugin (i.e. it's a package.main)
                        for (p in pluginCfgs) {
                                var absId = core.toAbsId(p + '!', '', newCfg);
                                newCfg.plugins[absId.substr(0, absId.length - 1)] = pluginCfgs[p];
                        }
                        pluginCfgs = newCfg.plugins;

                        // create search regex for each path map
                        for (p in pluginCfgs) {
                                // inherit full config
                                pluginCfgs[p] = beget(newCfg, pluginCfgs[p]);
                                var pathList = pluginCfgs[p].pathList;
                                if (pathList) {
                                        pluginCfgs[p].pathList = pathList.concat(newCfg.pathList);
                                        convertPathMatcher(pluginCfgs[p]);
                                }
                        }
                        convertPathMatcher(newCfg);

                        return newCfg;

                },

                checkPreloads: function (cfg) {
                        var preloads;
                        preloads = cfg && cfg['preloads'];
                        if (preloads && preloads.length > 0) {
                                // chain from previous preload, if any.
                                when(preload, function () {
                                        preload = core.getDeps(core.createContext(userCfg, undef, preloads, true));
                                });
                        }

                },

                resolvePathInfo: function (absId, cfg) {
                        // searches through the configured path mappings and packages
                        var pathMap, pathInfo, path, pkgCfg;

                        pathMap = cfg.pathMap;

                        if (!isAbsUrl(absId)) {
                                path = absId.replace(cfg.pathRx, function (match) {
                                        // TODO: remove fallbacks here since they should never need to happen
                                        pathInfo = pathMap[match] || {};
                                        pkgCfg = pathInfo.config;
                                        return pathInfo.path || '';
                                });
                        }
                        else {
                                path = absId;
                        }

                        return {
                                config: pkgCfg || userCfg,
                                url: core.resolveUrl(path, cfg)
                        };
                },

                resolveUrl: function (path, cfg) {
                        var baseUrl = cfg.baseUrl;
                        return baseUrl && !isAbsUrl(path) ? joinPath(baseUrl, path) : path;
                },

                checkToAddJsExt: function (url, cfg) {
                        // don't add extension if a ? is found in the url (query params)
                        // i'd like to move this feature to a moduleLoader
                        return url + ((cfg || userCfg).dontAddFileExt.test(url) ? '' : '.js');
                },

                loadScript: function (def, success, failure) {
                        // script processing rules learned from RequireJS

                        // insert script
                        var el = doc.createElement('script');

                        // initial script processing
                        function process (ev) {
                                ev = ev || global.event;
                                // detect when it's done loading
                                // ev.type == 'load' is for all browsers except IE6-9
                                // IE6-9 need to use onreadystatechange and look for
                                // el.readyState in {loaded, complete} (yes, we need both)
                                if (ev.type == 'load' || readyStates[el.readyState]) {
                                        delete activeScripts[def.id];
                                        // release event listeners
                                        el.onload = el.onreadystatechange = el.onerror = ''; // ie cries if we use undefined
                                        success();
                                }
                        }

                        function fail (e) {
                                // some browsers send an event, others send a string,
                                // but none of them send anything useful, so just say we failed:
                                failure(new Error('Syntax or http error: ' + def.url));
                        }

                        // set type first since setting other properties could
                        // prevent us from setting this later
                        // actually, we don't even need to set this at all
                        //el.type = 'text/javascript';
                        // using dom0 event handlers instead of wordy w3c/ms
                        el.onload = el.onreadystatechange = process;
                        el.onerror = fail;
                        // js! plugin uses alternate mimetypes
                        el.type = def.mimetype || 'text/javascript';
                        // TODO: support other charsets?
                        el.charset = 'utf-8';
                        el.async = !def.order;
                        el.src = def.url;

                        // loading will start when the script is inserted into the dom.
                        // IE will load the script sync if it's in the cache, so
                        // indicate the current resource definition if this happens.
                        activeScripts[def.id] = el;

                        head.insertBefore(el, insertBeforeEl);

                        // the js! plugin uses this
                        return el;
                },

                extractCjsDeps: function (defFunc) {
                        // Note: ignores require() inside strings and comments
                        var source, ids = [], currQuote;
                        // prefer toSource (FF) since it strips comments
                        source = typeof defFunc == 'string' ?
                                         defFunc :
                                         defFunc.toSource ? defFunc.toSource() : defFunc.toString();
                        // remove comments, then look for require() or quotes
                        source.replace(removeCommentsRx, '').replace(findRValueRequiresRx, function (m, id, qq) {
                                // if we encounter a quote
                                if (qq) {
                                        currQuote = currQuote == qq ? undef : currQuote;
                                }
                                // if we're not inside a quoted string
                                else if (!currQuote) {
                                        ids.push(id);
                                }
                                return ''; // uses least RAM/CPU
                        });
                        return ids;
                },

                fixArgs: function (args) {
                        // resolve args
                        // valid combinations for define:
                        // (string, array, object|function) sax|saf
                        // (array, object|function) ax|af
                        // (string, object|function) sx|sf
                        // (object|function) x|f

                        var id, deps, defFunc, defFuncArity, len, cjs;

                        len = args.length;

                        defFunc = args[len - 1];
                        defFuncArity = isType(defFunc, 'Function') ? defFunc.length : -1;

                        if (len == 2) {
                                if (isType(args[0], 'Array')) {
                                        deps = args[0];
                                }
                                else {
                                        id = args[0];
                                }
                        }
                        else if (len == 3) {
                                id = args[0];
                                deps = args[1];
                        }

                        // Hybrid format: assume that a definition function with zero
                        // dependencies and non-zero arity is a wrapped CommonJS module
                        if (!deps && defFuncArity > 0) {
                                cjs = true;
                                deps = ['require', 'exports', 'module'].slice(0, defFuncArity).concat(core.extractCjsDeps(defFunc));
                        }

                        return {
                                id: id,
                                deps: deps || [],
                                res: defFuncArity >= 0 ? defFunc : function () { return defFunc; },
                                cjs: cjs
                        };
                },

                executeDefFunc: function (def) {
                        var resource, moduleThis;
                        // the force of AMD is strong so anything returned
                        // overrides exports.
                        // node.js assumes `this` === `exports` so we do that
                        // for all cjs-wrapped modules, just in case.
                        // also, use module.exports if that was set
                        // (node.js convention).
                        // note: if .module exists, .exports exists.
                        moduleThis = def.cjs ? def.exports : undef;
                        resource = def.res.apply(moduleThis, def.deps);
                        if (resource === undef && def.exports) {
                                // note: exports will equal module.exports unless
                                // module.exports was reassigned inside module.
                                resource = def.module ? (def.exports = def.module.exports) : def.exports;
                        }
                        return resource;
                },

                defineResource: function (def, args) {

                        def.res = args.res;
                        def.cjs = args.cjs;
                        def.depNames = args.deps;
                        core.getDeps(def);

                },

                getDeps: function (parentDef) {

                        var i, names, deps, len, dep, completed, name,
                                exportCollector, resolveCollector;

                        deps = [];
                        names = parentDef.depNames;
                        len = names.length;

                        if (names.length == 0) allResolved();

                        function collect (dep, index, alsoExport) {
                                deps[index] = dep;
                                if (alsoExport) exportCollector(dep, index);
                        }

                        // reducer-collectors
                        exportCollector = countdown(len, collect, allExportsReady);
                        resolveCollector = countdown(len, collect, allResolved);

                        // initiate the resolution of all dependencies
                        // Note: the correct handling of early exports relies on the
                        // fact that the exports pseudo-dependency is always listed
                        // before other module dependencies.
                        for (i = 0; i < len; i++) {
                                name = names[i];
                                // is this "require", "exports", or "module"?
                                if (name in cjsGetters) {
                                        // a side-effect of cjsGetters is that the cjs
                                        // property is also set on the def.
                                        resolveCollector(cjsGetters[name](parentDef), i, true);
                                        // if we are using the `module` or `exports` cjs variables,
                                        // signal any waiters/parents that we can export
                                        // early (see progress callback in getDep below).
                                        // note: this may fire for `require` as well, if it
                                        // is listed after `module` or `exports` in the deps list,
                                        // but that is okay since all waiters will only record
                                        // it once.
                                        if (parentDef.exports) {
                                                parentDef.progress(msgUsingExports);
                                        }
                                }
                                // check for blanks. fixes #32.
                                // this helps support yepnope.js, has.js, and the has! plugin
                                else if (!name) {
                                        resolveCollector(undef, i, true);
                                }
                                // normal module or plugin resource
                                else {
                                        getDep(name, i);
                                }
                        }

                        return parentDef;

                        function getDep (name, index) {
                                var resolveOnce, exportOnce, childDef, earlyExport;

                                resolveOnce = countdown(1, function (dep) {
                                        exportOnce(dep);
                                        resolveCollector(dep, index);
                                });
                                exportOnce = countdown(1, function (dep) {
                                        exportCollector(dep, index);
                                });

                                // get child def / dep
                                childDef = core.fetchDep(name, parentDef);

                                // check if childDef can export. if it can, then
                                // we missed the notification and it will never fire in the
                                // when() below.
                                earlyExport = isPromise(childDef) && childDef.exports;
                                if (earlyExport) {
                                        exportOnce(earlyExport);
                                }

                                when(childDef,
                                        resolveOnce,
                                        parentDef.reject,
                                        parentDef.exports && function (msg) {
                                                // messages are only sent from childDefs that support
                                                // exports, and we only notify parents that understand
                                                // exports too.
                                                if (childDef.exports) {
                                                        if (msg == msgUsingExports) {
                                                                // if we're using exports cjs variable on both sides
                                                                exportOnce(childDef.exports);
                                                        }
                                                        else if (msg == msgFactoryExecuted) {
                                                                resolveOnce(childDef.exports);
                                                        }
                                                }
                                        }
                                );
                        }

                        function allResolved () {
                                parentDef.resolve(deps);
                        }

                        function allExportsReady () {
                                parentDef.exportsReady && parentDef.exportsReady(deps);
                        }

                },

                fetchResDef: function (def) {

                        // ensure url is computed
                        core.getDefUrl(def);

                        core.loadScript(def,

                                function () {
                                        var args = argsNet;
                                        argsNet = undef; // reset it before we get deps

                                        // if our resource was not explicitly defined with an id (anonymous)
                                        // Note: if it did have an id, it will be resolved in the define()
                                        if (def.useNet !== false) {

                                                // if !args, nothing was added to the argsNet
                                                if (!args || args.ex) {
                                                        def.reject(new Error(((args && args.ex) || 'define() missing or duplicated: ' + def.url)));
                                                }
                                                else {
                                                        core.defineResource(def, args);
                                                }
                                        }

                                },

                                def.reject

                        );

                        return def;

                },

                fetchDep: function (depName, parentDef) {
                        var toAbsId, isPreload, cfg, parts, mainId, loaderId, pluginId,
                                resId, pathInfo, def, tempDef, resCfg;

                        toAbsId = parentDef.toAbsId;
                        isPreload = parentDef.isPreload;
                        cfg = parentDef.config || userCfg; // is this fallback necessary?

                        // check for plugin loaderId
                        // TODO: this runs pluginParts() twice. how to run it just once?
                        parts = pluginParts(toAbsId(depName));
                        resId = parts.resourceId;
                        // get id of first resource to load (which could be a plugin)
                        mainId = parts.pluginId || resId;
                        pathInfo = core.resolvePathInfo(mainId, cfg);

                        // get custom module loader from package config if not a plugin
                        if (parts.pluginId) {
                                loaderId = mainId;
                        }
                        else {
                                // TODO: move config.moduleLoader to config.transform
                                loaderId = pathInfo.config['moduleLoader'];
                                if (loaderId) {
                                        // TODO: allow transforms to have relative module ids?
                                        // (we could do this by returning package location from
                                        // resolvePathInfo. why not return all package info?)
                                        resId = mainId;
                                        mainId = loaderId;
                                        pathInfo = core.resolvePathInfo(loaderId, cfg);
                                }
                        }

                        if (mainId in cache) {
                                def = cache[mainId];
                        } else {
                                def = core.createResourceDef(pathInfo.config, mainId, isPreload);
                                // TODO: can this go inside createResourceDef?
                                // TODO: can we pass pathInfo.url to createResourceDef instead?
                                def.url = core.checkToAddJsExt(pathInfo.url, pathInfo.config);
                                cache[mainId] = def;
                                core.fetchResDef(def);
                        }

                        // plugin or transformer
                        if (mainId == loaderId) {

                                // we need to use an anonymous promise until plugin tells
                                // us normalized id. then, we need to consolidate the promises
                                // below. Note: exports objects will be different between
                                // pre-normalized and post-normalized defs! does this matter?
                                // don't put this resource def in the cache because if the
                                // resId doesn't change, the check if this is a new
                                // normalizedDef (below) will think it's already being loaded.
                                tempDef = new Promise();

                                // note: this means moduleLoaders can store config info in the
                                // plugins config, too.
                                resCfg = cfg.plugins[loaderId] || cfg;

                                // wait for plugin resource def
                                when(def, function(plugin) {
                                        var normalizedDef, fullId, dynamic;

                                        dynamic = plugin['dynamic'];
                                        // check if plugin supports the normalize method
                                        if ('normalize' in plugin) {
                                                // note: dojo/has may return falsey values (0, actually)
                                                resId = plugin['normalize'](resId, toAbsId, def.config) || '';
                                        }
                                        else {
                                                resId = toAbsId(resId);
                                        }

                                        // use the full id (loaderId + id) to id plugin resources
                                        // so multiple plugins may each process the same resource
                                        // resId could be blank if the plugin doesn't require any (e.g. "domReady!")
                                        fullId = loaderId + '!' + resId;
                                        normalizedDef = cache[fullId];

                                        // if this is our first time fetching this (normalized) def
                                        if (!(fullId in cache)) {

                                                // because we're using resId, plugins, such as wire!,
                                                // can use paths relative to the resource
                                                normalizedDef = core.createPluginDef(resCfg, fullId, resId, isPreload);

                                                // don't cache non-determinate "dynamic" resources
                                                if (!dynamic) {
                                                        cache[fullId] = normalizedDef;
                                                }

                                                // curl's plugins prefer to receive a deferred,
                                                // but to be compatible with AMD spec, we have to
                                                // piggy-back on the callback function parameter:
                                                var loaded = function (res) {
                                                        normalizedDef.resolve(res);
                                                        if (!dynamic) cache[fullId] = res;
                                                };
                                                loaded['resolve'] = loaded;
                                                loaded['reject'] = loaded['error'] = normalizedDef.reject;

                                                // load the resource!
                                                plugin.load(resId, normalizedDef.require, loaded, resCfg);

                                        }

                                        // chain defs (resolve when plugin.load executes)
                                        if (tempDef != normalizedDef) {
                                                when(normalizedDef, tempDef.resolve, tempDef.reject, tempDef.progress);
                                        }

                                }, tempDef.reject);

                        }

                        // return tempDef if this is a plugin-based resource
                        return tempDef || def;
                },

                getCurrentDefName: function () {
                        // IE6-9 mark the currently executing thread as "interactive"
                        // Note: Opera lies about which scripts are "interactive", so we
                        // just have to test for it. Opera provides a true browser test, not
                        // a UA sniff, thankfully.
                        // learned this trick from James Burke's RequireJS
                        var def;
                        if (!isType(global.opera, 'Opera')) {
                                for (var d in activeScripts) {
                                        if (activeScripts[d].readyState == 'interactive') {
                                                def = d;
                                                break;
                                        }
                                }
                        }
                        return def;
                }

        };

        // hook-up cjs free variable getters
        cjsGetters = {'require': core.getCjsRequire, 'exports': core.getCjsExports, 'module': core.getCjsModule};

        function _curl (/* various */) {

                var args = [].slice.call(arguments), cfg;

                // extract config, if it's specified
                if (isType(args[0], 'Object')) {
                        cfg = args.shift();
                        userCfg = core.config(cfg, userCfg);
                        core.checkPreloads(cfg);
                }

                // thanks to Joop Ringelberg for helping troubleshoot the API
                function CurlApi (ids, callback, errback, waitFor) {
                        var then, ctx;
                        ctx = core.createContext(userCfg, undef, [].concat(ids));
                        this['then'] = then = function (resolved, rejected) {
                                when(ctx,
                                        // return the dependencies as arguments, not an array
                                        function (deps) {
                                                if (resolved) resolved.apply(undef, deps);
                                        },
                                        // just throw if the dev didn't specify an error handler
                                        function (ex) {
                                                if (rejected) rejected(ex); else throw ex;
                                        }
                                );
                                return this;
                        };
                        this['next'] = function (ids, cb, eb) {
                                // chain api
                                return new CurlApi(ids, cb, eb, ctx);
                        };
                        if (callback) then(callback, errback);
                        when(waitFor, function () { core.getDeps(ctx); });
                }

                return new CurlApi(args[0], args[1], args[2]);

        }

        _curl['version'] = version;

        function _define (args) {

                var id, def, pathInfo;

                id = args.id;

                if (id == undef) {
                        if (argsNet !== undef) {
                                argsNet = { ex: 'Multiple anonymous defines in url' };
                        }
                        else if (!(id = core.getCurrentDefName())/* intentional assignment */) {
                                // anonymous define(), defer processing until after script loads
                                argsNet = args;
                        }
                }
                if (id != undef) {
                        // named define(), it is in the cache if we are loading a dependency
                        // (could also be a secondary define() appearing in a built file, etc.)
                        def = cache[id];
                        if (!(id in cache)) {
                                // id is an absolute id in this case, so we can get the config.
                                pathInfo = core.resolvePathInfo(id, userCfg);
                                def = core.createResourceDef(pathInfo.config, id);
                                cache[id] = def;
                        }
                        if (!isPromise(def)) throw new Error('duplicate define: ' + id);
                        // check if this resource has already been resolved
                        def.useNet = false;
                        core.defineResource(def, args);
                }

        }

        // look for pre-existing globals
        userCfg = global[curlName];
        if (typeof userCfg == 'function') {
                prevCurl = userCfg;
                userCfg = false;
        }
        else {
                // don't use delete here since IE6-8 fail
                global[curlName] = undef;
        }

        // configure first time
        userCfg = core.config(userCfg);
        core.checkPreloads(userCfg);

        // allow curl to be a dependency
        cache[curlName] = _curl;

        // expose curl core for special plugins and modules
        // Note: core overrides will only work in either of two scenarios:
        // 1. the files are running un-compressed (Google Closure or Uglify)
        // 2. the overriding module was compressed into the same file as curl.js
        // Compiling curl and the overriding module separately won't work.
        cache['curl/_privileged'] = {
                'core': core,
                'cache': cache,
                'config': function () { return userCfg; },
                '_define': _define,
                '_curl': _curl,
                'Promise': Promise
        };

}(this.window || global));
/** MIT License (c) copyright B Cavalier & J Hann */

/**
 * curl js! plugin
 *
 * Licensed under the MIT License at:
 *                 http://www.opensource.org/licenses/mit-license.php
 *
 */

/**
 * usage:
 *  require(['ModuleA', 'js!myNonAMDFile.js!order', 'js!anotherFile.js!order], function (ModuleA) {
 *                 var a = new ModuleA();
 *                 document.body.appendChild(a.domNode);
 *         });
 *
 * Specify the !order suffix for files that must be evaluated in order.
 * Using the !order option and requiring js files more than once doesn't make
 * much sense since files are loaded exactly once.
 *
 * Specify the !exports=someGlobalVar option to return a global variable to
 * the module depending on the javascript file. Using this option also allows
 * positive error feedback to the loader since it can now detect if the
 * javascript file failed to load correctly.
 *
 * Async=false rules learned from @getify's LABjs!
 * http://wiki.whatwg.org/wiki/Dynamic_Script_Execution_Order
 *
 */
(function (global, doc, testGlobalVar) {
define('curl/plugin/js', ['curl/_privileged'], function (priv) {
"use strict";
        var cache = {},
                queue = [],
                supportsAsyncFalse = doc && doc.createElement('script').async == true,
                Promise,
                waitForOrderedScript,
                undef;

        Promise = priv['Promise'];

        function nameWithExt (name, defaultExt) {
                return name.lastIndexOf('.') <= name.lastIndexOf('/') ?
                        name + '.' + defaultExt : name;
        }

        function loadScript (def, success, failure) {
                // script processing rules learned from RequireJS

                var deadline, completed, el;

                // default deadline is very far in the future (5 min)
                // devs should set something reasonable if they want to use it
                deadline = new Date().valueOf() + (def.timeoutMsec || 300000);

                // initial script processing
                function process () {
                        completed = true;
                        if (def.exports) def.resolved = testGlobalVar(def.exports);
                        if (!def.exports || def.resolved) {
                                success(el); // pass el so it can be removed (text/cache)
                        }
                        else {
                                failure();
                        }
                }

                function fail (ex) {
                        // Exception is squashed by curl.js unfortunately
                        completed = true;
                        failure(ex);
                }

                // some browsers (Opera and IE6-8) don't support onerror and don't fire
                // readystatechange if the script fails to load so we need to poll.
                // this poller only runs if def.exports is specified and failure callback
                // is defined (see below)
                function poller () {
                        // if the script loaded
                        if (!completed) {
                                // if neither process or fail as run and our deadline is in the past
                                if (deadline < new Date()) {
                                        failure();
                                }
                                else {
                                        setTimeout(poller, 10);
                                }
                        }
                }
                if (failure && def.exports) setTimeout(poller, 10);

                el = priv['core'].loadScript(def, process, fail);

        }

        function fetch (def, promise) {

                loadScript(def,
                        function () {
                                // if there's another queued script
                                var next = queue.shift();
                                waitForOrderedScript = queue.length > 0;
                                if (next) {
                                        // go get it (from cache hopefully)
                                        fetch.apply(null, next);
                                }
                                promise.resolve(def.resolved || true);
                        },
                        function (ex) {
                                promise.reject(ex);
                        }
                );

        }

        return {

                // the !options force us to cache ids in the plugin and provide normalize
                'dynamic': true,

                'normalize': function (id, toAbsId, config) {
                        var end = id.indexOf('!');
                        return end >= 0 ? toAbsId(id.substr(0, end)) + id.substr(end) : toAbsId(id);
                },

                'load': function (name, require, callback, config) {

                        var order, exportsPos, exports, prefetch, url, def, promise;

                        order = name.indexOf('!order') > 0; // can't be zero
                        exportsPos = name.indexOf('!exports=');
                        exports = exportsPos > 0 && name.substr(exportsPos + 9); // must be last option!
                        prefetch = 'prefetch' in config ? config['prefetch'] : true;
                        name = order || exportsPos > 0 ? name.substr(0, name.indexOf('!')) : name;
                        // add extension afterwards so js!-specific path mappings don't need extension, too
                        url = nameWithExt(require['toUrl'](name), 'js');

                        function reject (ex) {
                                (callback['error'] || function (ex) { throw ex; })(ex);
                        }

                        // if we've already fetched this resource, get it out of the cache
                        if (url in cache) {
                                if (cache[url] instanceof Promise) {
                                        cache[url].then(callback, reject);
                                }
                                else {
                                        callback(cache[url]);
                                }
                        }
                        else {
                                def = {
                                        name: name,
                                        url: url,
                                        order: order,
                                        exports: exports,
                                        timeoutMsec: config['timeout']
                                };
                                cache[url] = promise = new Promise();
                                promise.then(
                                        function (o) {
                                                cache[url] = o;
                                                callback(o);
                                        },
                                        reject
                                );

                                // if this script has to wait for another
                                // or if we're loading, but not executing it
                                if (order && !supportsAsyncFalse && waitForOrderedScript) {
                                        // push onto the stack of scripts that will be fetched
                                        // from cache. do this before fetch in case IE has file cached.
                                        queue.push([def, promise]);
                                        // if we're prefetching
                                        if (prefetch) {
                                                // go get the file under an unknown mime type
                                                def.mimetype = 'text/cache';
                                                loadScript(def,
                                                        // remove the fake script when loaded
                                                        function (el) { el && el.parentNode.removeChild(el); },
                                                        function () {}
                                                );
                                                def.mimetype = '';
                                        }
                                }
                                // otherwise, just go get it
                                else {
                                        waitForOrderedScript = waitForOrderedScript || order;
                                        fetch(def, promise);
                                }
                        }

                }

        };
});
}(
        this,
        this.document,
        function () { try { return eval(arguments[0]); } catch (ex) { return; } }
));
/** MIT License (c) copyright B Cavalier & J Hann */

/**
 * curl css! plugin
 *
 * Licensed under the MIT License at:
 *                 http://www.opensource.org/licenses/mit-license.php
 *
 */

(function (global) {
"use strict";

/*
 * AMD css! plugin
 * This plugin will load and wait for css files.  This could be handy when
 * loading css files as part of a component or a theme.
 * Some browsers do not support the load event handler of the link element.
 * Therefore, we have to use other means to detect when a css file loads.
 * Some browsers don't support the error event handler, either.
 * The HTML5 spec states that the LINK element should have both load and
 * error events:
 * http://www.w3.org/TR/html5/semantics.html#the-link-element
 *
 * This plugin tries to use the load event and a universal work-around when
 * it is invoked.  If the load event works, it is used on every successive load.
 * Therefore, browsers that support the load event will just work (i.e. no
 * need for hacks!).  FYI, sniffing for the load event is tricky
 * since most browsers still have a non-functional onload property.
 *
 * IE is a special case since it also has a 31-stylesheet limit (finally
 * fixed in IE 10).  To get around this, we can use a set of <style>
 * elements instead of <link> elements and add @import; rules into them.
 * This allows us to add considerably more than 31 stylesheets.  See the
 * comment for the loadImport method for more information.
 *
 * The universal work-around for other browsers watches a stylesheet
 * until its rules are available (not null or undefined).  There are
 * nuances, of course, between the various browsers.  The isLinkReady
 * function accounts for these.
 *
 * Note: it appears that all browsers load @import'ed stylesheets before
 * fully processing the rest of the importing stylesheet. Therefore, we
 * don't need to find and wait for any @import rules explicitly.  They'll
 * be waited for implicitly.
 *
 * Global configuration options:
 *
 * cssNoWait: Boolean. You can instruct this plugin to not wait
 * for any css resources. They'll get loaded asap, but other code won't wait
 * for them.
 *
 * cssWatchPeriod: if direct load-detection techniques fail, this option
 * determines the msec to wait between brute-force checks for rules. The
 * default is 50 msec.
 *
 * You may specify an alternate file extension or no extension:
 *      require('css!myproj/component.less') // --> myproj/component.less
 *      require('css!myproj/component') // --> myproj/component.css
 *
 * When using alternative file extensions, be sure to serve the files from
 * the server with the correct mime type (text/css) or some browsers won't
 * parse them, causing an error.
 *
 * usage:
 *      require(['css!myproj/comp.css']); // load and wait for myproj/comp.css
 *      define(['css!some/folder/file'], {}); // wait for some/folder/file.css
 *      require(['css!myWidget']);
 *
 * Tested in:
 *      Firefox 3.6, 4.0, 11, 21
 *      Safari 3.0.4, 3.2.1, 5.0
 *      Chrome 19
 *      Opera 11.62, 12.01
 *      IE 6-10
 *  Error handlers work in the following:
 *          Firefox 12+
 *          Safari 6+
 *          Chrome 9+
 *          IE7-9
 *  Error handlers don't work in:
 *          Opera 11.62, 12.01
 *          Firefox 3.6, 4.0
 *          IE 6 and 10
*/

        var
                // compressibility shortcuts
                createElement = 'createElement',
                parentNode = 'parentNode',
                setTimeout = global.setTimeout,
                pluginBuilder = './builder/css',
                // doc will be undefined during a build
                doc = global.document,
                // find the head element and set it to it's standard property if nec.
                head,
                // infer IE 6-9
                // IE 10 still doesn't seem to have link.onerror support,
                // but it doesn't choke on >31 stylesheets at least!
                shouldCollectSheets = doc && doc.createStyleSheet && !(doc.documentMode >= 10),
                ieCollectorSheets = [],
                ieCollectorPool = [],
                ieCollectorQueue = [],
                ieMaxCollectorSheets = 12,
                loadSheet,
                msgHttp = 'HTTP or network error.',
                hasEvent = {};

        if (doc) {
                head = doc.head || doc.getElementsByTagName('head')[0];
                if (shouldCollectSheets) {
                        loadSheet = loadImport;
                }
                else {
                        loadSheet = loadLink;
                }
        }

        function setLoadDetection (event, hasNative) {
                hasEvent[event] = hasEvent[event] || hasNative;
        }

        function createLink () {
                var link;
                link = doc[createElement]('link');
                link.rel = "stylesheet";
                link.type = "text/css";
                return link;
        }

        /***** load functions for compliant browsers *****/

        function loadHandler (link, cb) {
                link.onload = function () {
                        // we know browser is compliant now!
                        setLoadDetection('load', true);
                        cb();
                };
        }

        function errorHandler (link, cb) {
                link.onerror = function () {
                        // we know browser is compliant now!
                        setLoadDetection('error', true);
                        cb();
                };
        }

        /***** ie load functions *****/

        /**
         * Loads a stylesheet via IE's addImport() method, which is the only
         * way to detect both onload and onerror in IE.  If we create a "parent
         * stylesheet", we can addImport() other sheets into it.  The tricky part
         * is that we have to load one sheet at a time and create a new onload
         * and onerror event for each one.  (IE only fires an onload or onerror
         * function once, but if you replace the onload or onerror functions,
         * it'll fire the new ones if there's another load or error event.
         * Way to be awesome, IE team!)
         *
         * To get around the one-sheet-at-a-time problem, we create many
         * parent stylesheets at once.  If we create 12 parent sheets, we can load
         * up to 12 imported sheets at once.  This has an additional benefit:
         * we can load 372 (12 * 31) stylesheets.  IE 6-9 can dynamically load only
         * 31 stylesheets in any one scope.  By creating multiple parent sheets, we
         * create multiple scopes.
         *
         * The astute reader will have discovered a major flaw with this approach:
         * we've killed the cascade (the "C" in CSS).  Rules in stylesheets override
         * rules in stylesheets that were declared earlier.  This is universal.
         * However, the IE team interpreted the word "earlier" differently than
         * everybody else (including the w3c).  IE interprets it as meaning "earlier
         * in time" (temporal), rather than "earlier in the document" (spacial).
         * Specifically, the temporal order of the insertion of the sheet into the
         * DOM/BOM is what matters in IE.
         *
         * In other words: the bungling of the IE team (both in allowing sheet
         * error handlers to execute multiple times and in allowing us to use
         * temporal order rather than dom order) has allowed us to implement
         * this work-around.
         *
         * Note: CSS debugging tools in IE 6-8 seem to fail when inserting
         * stylesheets dynamically no matter which method we use to insert them.
         *
         * @private
         * @param url {String}
         * @param cb {Function}
         * @param eb {Function}
         */
        function loadImport (url, cb, eb) {
                var coll;

                // push stylesheet and callbacks on queue
                ieCollectorQueue.push({
                        url:url,
                        cb:cb,
                        eb: function failure () { eb(new Error(msgHttp)); }
                });

                // find an available collector
                coll = getIeCollector();

                // if we have an available collector, import a stylesheet off queue
                if (coll) {
                        loadNextImport(coll);
                }

        }

        /**
         * Grabs the next sheet/callback item from the queue and imports it into
         * the provided collector sheet.
         * @private
         * @param coll {Stylesheet}
         */
        function loadNextImport (coll) {
                var imp;

                imp = ieCollectorQueue.shift();

                if (imp) {
                        coll.onload = function () {
                                imp.cb();
                                loadNextImport(coll);
                        };
                        coll.onerror = function () {
                                imp.eb();
                                loadNextImport(coll);
                        };
                        coll.styleSheet.addImport(imp.url);
                }
                else {
                        finalize(coll);
                        returnIeCollector(coll);
                }
        }

        /**
         * Returns a collector sheet to the pool.
         * @private
         * @param coll {Stylesheet}
         */
        function returnIeCollector (coll) {
                ieCollectorPool.push(coll);
        }

        /**
         * Gets the next collector sheet in the pool.  If there is no collector
         * in the pool and less than the maximum collector sheets has been created,
         * a new one is created. If the max collectors have been created,
         * undefined is returned.
         * @private
         * @return {HTMLElement} a stylesheet element to act as a collector sheet
         */
        function getIeCollector () {
                var el;

                el = ieCollectorPool.shift();

                if (!el && ieCollectorSheets.length < ieMaxCollectorSheets) {
                        el = doc.createElement('style');
                        ieCollectorSheets.push(el);
                        head.appendChild(el);
                }

                return el;
        }

        /***** load functions for legacy browsers (old Safari and FF) *****/

        function isLinkReady (link) {
                var ready, sheet, rules;
                // don't bother testing until we've fully initialized the link and doc;
                if (!link.href || !isDocumentComplete()) return false;

                ready = false;

                try {
                        sheet = link.sheet;
                        if (sheet) {
                                // old FF will throw a security exception here when an XD
                                // sheet is loaded. webkits (that don't support onload)
                                // will return null when an XD sheet is loaded
                                rules = sheet.cssRules;
                                ready = rules === null;
                                if (!ready && 'length' in rules) {
                                        // Safari needs to further test for rule manipulation
                                        // on local stylesheets (Opera too?)
                                        sheet.insertRule('-curl-css-test {}', 0);
                                        sheet.deleteRule(0);
                                        ready = true;
                                }
                        }
                }
                catch (ex) {
                        // a "security" or "access denied" error indicates that an XD
                        // stylesheet has been successfully loaded in old FF
                        ready = /security|denied/i.test(ex.message);
                }

                return ready;
        }

        function finalize (link) {
                // noop serves as a flag that a link event fired
                // note: Opera and IE won't clear handlers if we use a non-function
                link.onload = link.onerror = noop;
        }

        function isFinalized (link) {
                return link.onload == noop || !link.onload;
        }

        function loadWatcher (link, wait, cb) {
                // watches a stylesheet for loading signs.
                if (hasEvent['load']) return; // always check on re-entry
                if (isLinkReady(link)) {
                        cb();
                }
                else if (!isFinalized(link)) {
                        setTimeout(function () { loadWatcher(link, wait, cb); }, wait);
                }
        }

        function errorWatcher (link, wait, eb) {
                if (hasEvent['error']) return;
                // TODO: figure out a method to test for stylesheet failure without risk of re-fetching
        }

        function linkLoaded (link, wait, cb) {
                // most browsers now support link.onload, but many older browsers
                // don't. Browsers that don't will launch the loadWatcher to repeatedly
                // test the link for readiness.
                function load () {
                        // only executes once (link.onload is acting as a flag)
                        if (isFinalized(link)) return;
                        finalize(link);
                        waitForDocumentComplete(cb);
                }
                // always try standard handler
                loadHandler(link, load);
                // also try the fallback
                loadWatcher(link, wait, load);
        }

        function linkErrored (link, wait, cb) {
                // very few browsers (Chrome 19+ and FF9+ as of Apr 2012) have a
                // functional onerror handler (and those only detect 40X/50X http
                // errors, not parsing errors as per the w3c spec).
                // IE6-9 call onload when there's an http error. (nice, real nice)
                // this only matters in IE9 since IE6-8 use the addImport method
                // which does call onerror.
                function error () {
                        // only executes once (link.onload is acting as a flag)
                        if (isFinalized(link)) return;
                        finalize(link);
                        cb(new Error(msgHttp));
                }
                // always try standard handler
                errorHandler(link, error);
                // if we are not sure if the native error event works, try the fallback
                errorWatcher(link, wait, error);
        }

        function loadLink (url, cb, eb, period) {
                var link;
                link = createLink();
                linkLoaded(link, period, cb);
                linkErrored(link, period, eb);
                link.href = url;
                head.appendChild(link);
        }

        function waitForDocumentComplete (cb) {
                // this isn't exactly the same as domReady (when dom can be
                // manipulated). it's later (when styles are applied).
                // chrome needs this (and opera?)
                function complete () {
                        if (isDocumentComplete()) {
                                cb();
                        }
                        else {
                                setTimeout(complete, 10);
                        }
                }
                complete();
        }

        function isDocumentComplete () {
                return !doc.readyState || doc.readyState == 'complete';
        }

        function nameWithExt (name, defaultExt) {
                return name.lastIndexOf('.') <= name.lastIndexOf('/') ?
                        name + '.' + defaultExt : name;
        }

        function noop () {}

        /***** finally! the actual plugin *****/

        define('curl/plugin/css', {

                'normalize': function (resourceId, normalize) {
                        var resources, normalized;

                        if (!resourceId) return resourceId;

                        resources = resourceId.split(",");
                        normalized = [];

                        for (var i = 0, len = resources.length; i < len; i++) {
                                normalized.push(normalize(resources[i]));
                        }

                        return normalized.join(',');
                },

                'load': function (resourceId, require, callback, config) {
                        var resources, cssWatchPeriod, cssNoWait, loadingCount, i;
                        resources = (resourceId || '').split(",");
                        cssWatchPeriod = config['cssWatchPeriod'] || 50;
                        cssNoWait = config['cssNoWait'];
                        loadingCount = resources.length;

                        // this function must get called just once per stylesheet!
                        function loaded () {
                                if (--loadingCount == 0) {
                                        callback();
                                }
                        }

                        function failed (ex) {
                                var eb;
                                eb = callback.reject || function (ex) {
                                        throw ex;
                                };
                                eb(ex);
                        }

                        for (i = 0; i < resources.length; i++) {

                                resourceId = resources[i];

                                var url, link;
                                url = nameWithExt(require['toUrl'](resourceId), 'css');

                                if (cssNoWait) {
                                        link = createLink();
                                        link.href = url;
                                        head.appendChild(link);
                                        loaded();
                                }
                                else {
                                        loadSheet(url, loaded, failed, cssWatchPeriod);
                                }
                        }

                },

                'plugin-builder': pluginBuilder,
                'pluginBuilder': pluginBuilder

        });

})(this);
/** MIT License (c) copyright B Cavalier & J Hann */

/**
 * curl domReady
 *
 * Licensed under the MIT License at:
 *                 http://www.opensource.org/licenses/mit-license.php
 */

/**
 * usage:
 *  require(['ModuleA', 'curl/domReady'], function (ModuleA, domReady) {
 *                 var a = new ModuleA();
 *                 domReady(function () {
 *                         document.body.appendChild(a.domNode);
 *                 });
 *         });
 *
 * also: check out curl's domReady! plugin
 *
 * HT to Bryan Forbes who wrote the initial domReady code:
 * http://www.reigndropsfall.net/
 *
 */
(function (global, doc) {

        var
                readyState = 'readyState',
                // keep these quoted so closure compiler doesn't squash them
                readyStates = { 'loaded': 1, 'interactive': 1, 'complete': 1 },
                callbacks = [],
                fixReadyState = doc && typeof doc[readyState] != "string",
                // IE needs this cuz it won't stop setTimeout if it's already queued up
                completed = false,
                pollerTime = 10,
                addEvent,
                remover,
                removers = [],
                pollerHandle,
                undef;

        function ready () {
                completed = true;
                clearTimeout(pollerHandle);
                while (remover = removers.pop()) remover();
                if (fixReadyState) {
                        doc[readyState] = "complete";
                }
                // callback all queued callbacks
                var cb;
                while ((cb = callbacks.shift())) {
                        cb();
                }
        }

        var testEl;
        function isDomManipulable () {
                // question: implement Diego Perini's IEContentLoaded instead?
                // answer: The current impl seems more future-proof rather than a
                // non-standard method (doScroll). i don't care if the rest of the js
                // world is using doScroll! They can have fun repairing their libs when
                // the IE team removes doScroll in IE 13. :)
                if (!doc.body) return false; // no body? we're definitely not ready!
                if (!testEl) testEl = doc.createTextNode('');
                try {
                        // webkit needs to use body. doc
                        doc.body.removeChild(doc.body.appendChild(testEl));
                        testEl = undef;
                        return true;
                }
                catch (ex) {
                        return false;
                }
        }

        function checkDOMReady (e) {
                var isReady;
                // all browsers except IE will be ready when readyState == 'interactive'
                // so we also must check for document.body
                isReady = readyStates[doc[readyState]] && isDomManipulable();
                if (!completed && isReady) {
                        ready();
                }
                return isReady;
        }

        function poller () {
                checkDOMReady();
                if (!completed) {
                        pollerHandle = setTimeout(poller, pollerTime);
                }
        }

        // select the correct event listener function. all of our supported
        // browsers will use one of these
        if ('addEventListener' in global) {
                addEvent = function (node, event) {
                        node.addEventListener(event, checkDOMReady, false);
                        return function () { node.removeEventListener(event, checkDOMReady, false); };
                };
        }
        else {
                addEvent = function (node, event) {
                        node.attachEvent('on' + event, checkDOMReady);
                        return function () { node.detachEvent(event, checkDOMReady); };
                };
        }

        if (doc) {
                if (!checkDOMReady()) {
                        // add event listeners and collect remover functions
                        removers = [
                                addEvent(global, 'load'),
                                addEvent(doc, 'readystatechange'),
                                addEvent(global, 'DOMContentLoaded')
                        ];
                        // additionally, poll for readystate
                        pollerHandle = setTimeout(poller, pollerTime);
                }
        }

        define('curl/domReady', function () {

                // this is simply a callback, but make it look like a promise
                function domReady (cb) {
                        if (completed) cb(); else callbacks.push(cb);
                }
                domReady['then'] = domReady;
                domReady['amd'] = true;

                return domReady;

        });

}(this, this.document));
