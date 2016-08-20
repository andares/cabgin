
var Cabgin = {

    /**
     * 对象属性
     * @type type
     */
    casper:     null,
    controller: null,
    agent:      null,
    logfile:    'cabgin.log',
    logpath:    '/home/log/worker',
    log_status: 0,
    log_lasturl: '',
    
    // cache
    cache:      '',
    cache_file: '',
    cache_url: '',
    hash: null,
    update_cache: false,
    
    /**
     * 被getCurrentUrl()选中的url
     */
    current_url: '',
    
    logPageInited: function(url) {
        this.log_status     = 1;
        this.log_lasturl    = url;
        this.log("page inited: " + url);
    },
    
    logResReceived: function(url) {
        if (this.log_status == 2 && this.log_lasturl == url) {
            this.log('.', true);
            return true;
        }

        this.log_status = 2;
        this.log_lasturl    = url;
        this.log("res received: " + url + " ");
    },
    
    logResRquested: function(url) {
        if (this.log_status == 3 && this.log_lasturl == url) {
            this.log('.', true);
            return true;
        }

        this.log_status = 3;
        this.log_lasturl    = url;
        this.log("res requested: " + url + " ");
    },
    
    logWaitTimeout: function(url) {
        this.log_status = 4;
        this.log_lasturl    = url;
        cabgin.log("waiting: " + url);
    },

    casper_options: {
        timeout: 1000 * 10,
        onPageInitialized: function() {
            cabgin.logPageInited(this.current_url);
        },
        onResourceReceived: function() {
            cabgin.logResReceived(this.current_url);
        },
        onResourceRequested: function() {
            cabgin.logResRquested(this.current_url);
        },
        onWaitTimeout: function() {
            cabgin.logWaitTimeout(this.current_url);
        },
        logLevel: 'all'
    },
    
    /**
     * 主要是http header配置
     * @type type
     */
    call_options: {
//        'method':   'get',
//        'data':     {},
        'encoding': 'utf8',
        'header':   {
            'Accept': 'text/html'
//            'Accept': 'application/json'
        }
    },
    
    /**
     * 是否跳过访问间隔时间
     * @type Boolean
     */
    skip_sleep: false,
    sleep_min: 500,
    sleep_max: 2500,
    
    /**
     * 
     * @type String
     */
    user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',

    /**
     * url管理部分
     * @type String|Cabgin@pro;controller@call;getUrl
     */
    url:        '',
    url_list:   [],
    url_count:  -1,
    
    /**
     * 初始化
     * @param {type} casper
     * @param {type} agent
     * @returns {undefined}
     */
    init: function (casper) {
        this.casper = casper;
    },
    
    enableCache: function (cache_path, hash, update_cache) {
        this.cache = cache_path;
        this.hash  = hash;
        this.update_cache  = update_cache;
    },

    /**
     * 暂停方法
     * @returns {Boolean}
     */
    sleepAndProcess: function(func) {
        if (this.skip_sleep) {
            this.process();
            return true;
        }

        var d = parseInt(Math.random()*(this.sleep_max - this.sleep_min + 1) + this.sleep_min);
        this.casper.echo("=== wait : " + d);
//        for (var t = Date.now(); Date.now() - t <= d;);

        var cabgin = this;
        setTimeout(function () {
            cabgin.process();
        }, d);
    },
    
    /**
     * 启动
     * @param {type} controller
     * @returns {undefined}
     */
    run: function(controller) {
        // cache
        if (this.cache && this.hash == null) {
            this.casper.echo("Cache is enabled, but hash module not init!");
            this.casper.echo("Fetal error.");
            this.casper.exit();
        }
        
        var cabgin = this;
        
        // 初始化部分
        this.casper.start();
        this.casper.userAgent(this.user_agent);
        
        // casper配置
        for (key in this.casper_options) {
            this.casper.options[key] = this.casper_options[key];
        }

        // 设置url
        this.setController(controller);
        this.setUrl();

        // 开始执行
        this.callUrl();
        this.casper.run(function() {
            cabgin.sleepAndProcess();
        });
    },

    /**
     * 重复的处理逻辑，在url列表中访问直到成功，并继续访问。。
     * @returns {undefined}
     */
    process: function() {
//        if (!this.skip_sleep) {
//            this.sleep();
//        }

        // 检测
        if (this.controller.verify()) {
            this.setController(this.controller.main(this));
            this.setUrl();
        } else {
            this.removeCurrentUrl();
        }
        
        // 以下是再次调用
        this.callUrl();
        var cabgin = this;
        this.casper.run(function() {
            cabgin.sleepAndProcess();
        });
    },
    
    /**
     * 单次访问url
     * @returns {undefined}
     */
    callUrl: function() {
        var url = this.getCurrentUrl();
        if (!url) {
            
            // 加入verifyFail接口处理
            if (this.controller.hasOwnProperty('verifyFail')) {
                var controller = this.controller.verifyFail();
                this.setController(controller);
                this.setUrl();

                // 以下是再次调用
                this.callUrl();
                var cabgin = this;
                this.casper.run(function() {
                    cabgin.sleepAndProcess();
                });
                return true;

            } else {
                this.quit('not url');
            }
        }
        
        // cache
        this.casper.echo(">>> call url: " + url);
        if (this.cache_url) {
            this.casper.open(url, this.call_options, this.cache_url);
        } else {
            this.casper.open(url, this.call_options);
        }

        // 超时处理
        var cabgin = this;
        this.casper.options.onTimeout = function() {
            cabgin.casper.echo('>>> call timeout');
            cabgin.sleepAndProcess();
        };

        this.casper.then(function() {
            // cache
            if (cabgin.cache_file) {
                var content = cabgin.casper.getPageContent();
                var fs = require('fs');
                fs.write(cabgin.cache_file, content, 'w');
                
                cabgin.cache_file = '';
            }
        });
    },

    /**
     * 设置url
     * @returns {undefined}
     */
    setUrl: function () {
        this.url = this.controller.getUrl();
        if (!this.url) {
            this.casper.echo(">> get url empty");
            return false;
        }
        
        // cache
        if (this.cache) {
            // 加入url alias功能
            var cache_url = '';
            if (this.controller.hasOwnProperty('getUrlAlias')) {
                var cache_url = this.controller.getUrlAlias();
            }
            if (!cache_url) {
                cache_url = this.url;
            }
            var cache_file = this.getCacheFile(cache_url);

            var fs = require('fs');
            if (!this.update_cache && fs.exists(cache_file)) {
                this.url_list   = [cache_file];
                this.cache_url  = cache_url;
                this.casper.echo('load cache: ' + cache_file);
                return true;
            }

            this.cache_file = cache_file;
        }
        // 重置cache_url
        this.cache_url = '';
        
        this.casper.echo("");
        this.casper.echo(">> get url: " + this.url);

        if (this.agent) {
            this.agent.random();
            this.url_list = this.agent.getUrlList(this.url);
        } else {
            this.url_list = [this.url];
        }
        
        return true;
    },
    
    /**
     * 从url列表中移除一条。
     * 一般是检查到该url失败后调用
     * @returns {undefined}
     */
    removeCurrentUrl: function() {
        // 修正count位置
        this.url_count = this.url_count % this.url_list.length;
        this.url_list.splice(this.url_count, 1);
        this.url_count--;
    },

    /**
     * 获取当前访问的url
     * @returns {Array|Cabgin@pro;agent@call;getUrlList|Boolean}
     */
    getCurrentUrl: function () {
        this.url_count++;
        var count = this.url_count % this.url_list.length;
        if (this.url_list.length <= 0) {
            return false;
        }

        this.current_url = this.url_list[count];
        return this.current_url;
    },
    
    getCacheFile: function (url) {
        // 构建策略
        // 分离出domain或ip，作为一级目录名
        // 按url path部分创建目录
        var match   = url.match(/^(http\:\/\/){0,1}([^\/]+)([^\?]*)(.*)/);
        var domain  = match[2];
        var path    = CabginLib.explode(match[3], '/');
        
        var dir = this.cache + '/' + domain + '/' + path.join('/') + '/';
        var fs  = require('fs');
        if (!fs.exists(dir)) {
            fs.makeTree(dir);
        }
        
        var file = this.hash.make(match[4]) + '.html';
        return dir + file;
    },
    
    /**
     * 设置controller
     * @param {type} controller
     * @returns {undefined}
     */
    setController: function(controller) {
        // 检查是否有结束接口
        if (!controller) {
            if (this.controller && this.controller.hasOwnProperty('shutdown')) {
                this.controller.shutdown();
            }

            this.quit('done.');
        }

        this.controller = controller;
    },
    
    /**
     * 设置call option
     * @param {type} name
     * @param {type} value
     * @returns {undefined}
     */
    setCallOption: function(name, value) {
        this.call_options[name] = value;
    },

    log: function(msg, noln, file, path) {
        if (!file) {
            file = this.logfile;
        }
        if (!path) {
            path = this.logpath;
        }
        
        var fs  = require('fs');
        if (!fs.exists(path)) {
//            fs.makeTree(path);
            return false;
        }

        var date = new Date();
        var time = date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate() + ' ' + date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds();
        if (!noln) {
            msg = "\n[" + time + "] " + msg;
        }
        fs.write(path + '/' + file, msg, 'a');
    },

    /**
     * 退出
     * @param {type} msg
     * @returns {undefined}
     */
    quit: function(msg) {
        this.casper.echo("|>> cabgin quit: " + msg);
        this.casper.exit();
    }
};

var CabginLib = {
    explode: function (inputstring, separators, includeEmpties) {
        if (includeEmpties) {
            return inputstring.split('/');
        }
        
        inputstring = new String(inputstring);
        separators  = new String(separators);

        if (separators == "undefined") {
            separators = " :;";
        }

        fixedExplode = new Array(1);
        currentElement = "";
        count = 0;

        for (x = 0; x < inputstring.length; x++) {
            str = inputstring.charAt(x);
            if (separators.indexOf(str) != -1) {
                if (currentElement || includeEmpties) {
                    fixedExplode[count] = currentElement;
                    count++;
                    currentElement = "";
                }
            } else {
                currentElement += str;
            }
        }

        if (currentElement || includeEmpties) {
            fixedExplode[count] = currentElement;
        }
        return fixedExplode;
    }

};

exports.create = function create(casper, libs) {
    "use strict";
    
    // patch for casper
    var utils   = libs.utils;
    var qs      = libs.qs;
    casper.open = function(location, settings, cache_url) {
        "use strict";
        /*jshint maxstatements:30*/
        var baseCustomHeaders = this.page.customHeaders,
            customHeaders = settings && settings.headers || {};
        this.checkStarted();
        settings = utils.isObject(settings) ? settings : {};
        settings.method = settings.method || "get";
        // http method
        // taken from https://github.com/ariya/phantomjs/blob/master/src/webpage.cpp#L302
        var methods = ["get", "head", "put", "post", "delete"];
        if (settings.method && (!utils.isString(settings.method) || methods.indexOf(settings.method.toLowerCase()) === -1)) {
            throw new CasperError("open(): settings.method must be part of " + methods.join(', '));
        }
        // http data
        if (settings.data) {
            if (utils.isObject(settings.data)) { // query object
                settings.data = qs.encode(settings.data);
            } else if (!utils.isString(settings.data)) {
                throw new CasperError("open(): invalid request settings data value: " + settings.data);
            }
        }

        // 实现真缓存载入
        if (cache_url != undefined && cache_url) {
            var fs = require('fs');
            var content = fs.read(location);
            this.page.setContent(content, cache_url);
        } else {
            // clean location
            location = utils.cleanUrl(location);
            // current request url
            this.configureHttpAuth(location, settings);
            this.requestUrl = this.filter('open.location', location) || location;
            this.emit('open', this.requestUrl, settings);
            this.log(utils.format('opening url: %s, HTTP %s', this.requestUrl, settings.method.toUpperCase()), "debug");
            // reset resources
            this.resources = [];
            // custom headers
            this.page.customHeaders = utils.mergeObjects(utils.clone(baseCustomHeaders), customHeaders);
            // perfom request
            this.browserInitializing = true;
            this.page.openUrl(this.requestUrl, {
                operation: settings.method,
                data:      settings.data
            }, this.page.settings);
            // revert base custom headers
            this.page.customHeaders = baseCustomHeaders;
        }
        return this;
    };
    
    casper.dump = utils.dump;
    
    var obj = Object.create(Cabgin);
    obj.init(casper);
    return obj;
};




