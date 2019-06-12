var tpack = tpack || {
		cache: { __proto__: null },
		define: function (moduleName, factory) {
			tpack.cache[moduleName.toLowerCase()] = {
				loaded: false,
				define: factory,
				exports: {}
			};
		},
		require: function (moduleName, callback, data) {
			if (typeof moduleName === "string") {
				var module = tpack.cache[moduleName.toLowerCase()];
				if (typeof callback === "function") {
					if (module) {
						setTimeout(callback, 0, tpack.require(moduleName), data);
					} else {
						tpack.async((tpack.baseUrl || "") + moduleName + (tpack.urlArgs || ""), function () {
							callback(tpack.require(moduleName), data);
						});
					}
				} else {
					if (!module) {
						throw "Cannot find module '" + moduleName + "'";
					}
					if (!module.loaded) {
						module.loaded = true;
						module.define(tpack.require, module.exports, module);
					}
					return module.exports;
				}
			} else {
				var pending = moduleName.length;
				if (pending) {
					var exports = [];
					for (var i = 0; i < pending; i++) {
						tpack.require(moduleName[i], function (moduleExport, i) {
							exports[i] = moduleExport;
							--pending < 1 && callback && callback.apply(this, exports);
						}, i);
					}
				} else {
					callback && callback(this);
				}
			}
		},
		async: function (url, callback) {
			var script = document.createElement("script");
			script.async = true;
			script.onload = callback;
			script.src = url;
			return (document.head || document.getElementsByTagName("head")[0] || document.documentElement).appendChild(script);
		},
		style: function (content) {
			return (document.head || document.getElementsByTagName("head")[0] || document.documentElement).appendChild(document.createElement('style')).innerHTML = content;
		}
	};
	
	tpack.define("jjencode/basic.js", function (require, exports, module) {
	alert("Hello, JavaScript");

});

digo.require("jjencode/basic.js");//# sourceMappingURL=basic.js.map