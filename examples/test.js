/**
 * 载入核心
 */
var casper = require('casper').create();
// 载入其他类
var utils  = require('utils');
var qs     = require('querystring');

var md5    = require('md5').create();
// cabgin
var cabgin = require('cabgin').create(casper, {utils: utils, qs: qs});




/*** ============================== ***/
// 拿参数
if (!casper.cli.has(0) || !casper.cli.has(1)) {
    casper.echo('params lost.');
    casper.echo('try: casperjs --web-security=false <js> <name> <url> [<cache_path>]');
    casper.exit();
}
var name = casper.cli.get(0);
var url  = casper.cli.get(1);

var cache_path = casper.cli.get(2);
if (cache_path != undefined) {
    var update_cache = casper.cli.get(3);
    if (update_cache == undefined || update_cache == '0') {
        update_cache = false;
    } else {
        update_cache = true;
    }
    cabgin.enableCache(cache_path, md5, update_cache);
}

// 结果集创建
var result = require('travobresult').create(url, name);

// debug用，设0不进行debug
var page_limit = casper.cli.has(4) ? parseInt(casper.cli.get(4)) : 30;
var sub_limit  = casper.cli.has(5) ? parseInt(casper.cli.get(5)) : 0;

/*** ============================== ***/
/***
 * 根据情况载入并创建
 */
// 载入lib与agent
var travoblib   = require('travoblib_mfw').create();
var agent       = require('travobagent').create('mfw');

// cabgin初始化
cabgin.agent = agent;
cabgin.sleep_min = 3500;
cabgin.sleep_max = 8500;
cabgin.skip_sleep = false;


/*** ============================== ***/
/***
 * 控制器
 * @param {type} result
 * @returns {ControllerMaster}
 */
var ControllerMaster = function(result) {
    this.result     = result;

    this.getUrl = function() {
        return this.result.url;
    };

    this.main = function() {
        var entry = travoblib.parseCountry(casper, this.result, this.result.url);
        this.result.self = entry;
        
        // 创建下一个控制器
        var controller = new ControllerList(result, this.item_id);
        return controller;
    };

    this.verify = function() {
        var pass = true;
        try {
            this.item_id = travoblib.getItemId(this.result.url);
            if (!this.item_id) {
                pass = false;
            }
        } catch (e) {
            pass = false;
        }
        return pass;
    };
    
    // --------------- 以下是自定义方法 ---------------
    this.result.source = 'mfw';
    this.result.type   = 1; // 1城市，2景点，4美食， 9购物, 8娱乐， 20酒店, 10交通
    
    this.item_id = 0;
};

var ControllerList = function(result, item_id) {
    this.page_count = 0;
    this.result = result;

    this.getUrl = function() {
        var url  = 'http://www.mafengwo.cn/gonglve/sg_ajax.php?sAct=getMapData&iMddid='+this.item_id+'&iType=3&iPage=' + (this.count * 3 + 1);
        return url;
    };

    this.main = function() {
        this.page_count++;

        // 拿sub url list
        for (var i = 0; i < this.json.list.length; i++) {
            this.sub_url_list.push(this.json.list[i]);
        }
        this.count++;

        // 继续
        if (this.sub_url_list.length >= this.json.total || (page_limit && this.page_count >= page_limit)) {
            // 跳到sub
            var controller = new ControllerSub(result, this.sub_url_list);
            return controller;
        }
        return this;
    };

    this.verify = function() {
        var pass = true;
        try {
            this.json = travoblib.getJsonList(casper.getPageContent());
            if (!this.json) {
                pass = false;
            }
        } catch (e) {
            pass = false;
        }
        return pass;
    };
    
    // --------------- 以下是自定义方法 ---------------
    this.sub_url_list = [];
    
    this.item_id = item_id;
    this.count = 0;

    cabgin.setCallOption('header', {
        'Accept': 'application/json'
    });
};

var ControllerSub = function(result, sub_url_list) {
    this.result = result;

    this.getUrl = function() {
        return 'http://www.mafengwo.cn/travel-scenic-spot/mafengwo/' + this.sub_url_list[this.current].id + '.html';
    };

    this.main = function() {
        var sub = travoblib.parseCity(casper, this.result, this.getUrl());
        this.result.subes.push(sub);
        
        // 结束判断
        this.current++;
        if (this.sub_url_list.length <= this.current || (sub_limit && this.current >= sub_limit)) {
            return false;
        }
        
        return this;
    };

    this.verify = function() {
        var pass = true;
        try {
            var test = casper.getElementsInfo('div.r-main h1');
            if (!test) {
                pass = false;
            }
        } catch (e) {
            pass = false;
        }
        return pass;
    };

    this.verifyFail = function() {
        // 结束判断
        this.current++;
        if (this.sub_url_list.length <= this.current || (sub_limit && this.current >= sub_limit)) {
            return false;
        }
        
        return this;
    };

    this.shutdown = function() {
        casper.echo(this.result.toJson());

        utils.dump(this.result);
    };
    
    // --------------- 以下是自定义方法 ---------------
    this.sub_url_list = sub_url_list;
    this.current = 0;
};

/***
 * 走起
 * @param {type} param1
 * @param {type} param2
 */
cabgin.run(new ControllerMaster(result));

