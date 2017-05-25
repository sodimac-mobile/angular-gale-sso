angular.module('gale-sso.services')


.provider('$cordovaSingleSignOn', function() {
    var $this = this;

    //Configurable Variable on .config Step
    var _appId = null;
    var _ssoBaseURL = null;

    this.setAppId = function(value) {
        _appId = value;
        return $this;
    };

    this.setApiUrl = function(value) {
        //ADD THE "/" AT THE END IF NOT SET
        if (value && !value.endsWith("/")) {
            value += "/";
        }

        _ssoBaseURL = value;
        return $this;
    };

    this.$get = ['$q', '$Api', '$Identity', '$LocalStorage', function($q, $Api, $Identity, $LocalStorage) {
        var self = this;
        var _authResponse = null;
        var _platform = (typeof ionic === "object" ? "ionic" : "browser");

        //Check if Develop in a browser :P
        if (_platform === "ionic") {
            //If Not in WebView (Device) , set mode browser
            if (!ionic.Platform.isWebView()) {
                _platform = "browser";
            }
        }


        //TRY TO RECONSTRUCT THE IDENTITY DATA
        if ($Identity.isAuthenticated()) {
            _authResponse = {
                connected: "connected",
                access_token: $Identity.getAccessToken()
            };
        }

        self.getAppId = function() {
            if (!_appId) {
                throw Error("APP_ID_NOT_SET");
            }
            return _appId;
        };

        self.getApiUrl = function() {
            if (!_ssoBaseURL) {
                throw Error("SSO_BASEURL_NOT_SET");
            }
            return _ssoBaseURL;
        };

        self.getAccessToken = function() {
            if (!_authResponse) {
                throw Error("MUST_CALL_LOGIN_BEFORE_GET_ACCESSTOKEN");
            }
            return _authResponse.access_token;
        };


        var parseFragment = function(uri) {
            var parsed = $q.defer();
            var qs = uri.substring(uri.indexOf("#access_token") + 1).split("&");

            var build = function(tokens) {
                var j = {};
                for (var q in qs) {
                    var text = qs[q];
                    for (var prop in tokens) {
                        var name = tokens[prop];
                        if (text.indexOf(name) === 0) {
                            var value = text.replace(name + "=", "");
                            j[tokens[prop]] = (name === "expires_in" ? parseInt(value) : value);
                            continue;
                        }
                    }
                }
                return j;
            };

            setTimeout(function() {
                var isSuccess = (function(uri) {
                    var ok = false;
                    angular.forEach(qs, function(q) {
                        if (q.indexOf("access_token") === 0) {
                            ok = true;
                            return false;
                        }
                    });
                    return ok;
                })();

                //Is Authenticate
                if (isSuccess) {

                    var j1 = build(["access_token",
                        "expires_in",
                        "token_type"
                    ]);
                    _authResponse = j1; //Set the authResponse, for after call's
                    var result = {
                        authResponse: j1,
                        status: "connected"
                    };

                    parsed.resolve(result);
                } else {
                    var j2 = build([
                        "error"
                    ]);
                    parsed.reject({
                        status: "not_connected",
                        error: j2
                    });
                }

            }, 10);

            return parsed.promise;
        };

        //Check all cordova dependencies
        var checkDependencies = function() {
            //check for inAppBrowser
            (function(dependencies) {
                for (var i in dependencies) {
                    var dependency = dependencies[i];

                    if (!eval(dependency.assert)) {
                        throw new Error(
                            "The cordova plugin '{0}' is required for Cordova Single Sign On".format([
                                dependency.package
                            ])
                        );
                    }
                }
            })([
                { assert: "cordova", package: "cordova" },
                { assert: "cordova.InAppBrowser", package: "cordova-plugin-inappbrowser" },
                { assert: "window.plugins", package: "cordova" },
                { assert: "window.plugins.launchmyapp", package: "cordova-plugin-customurlscheme" },
                { assert: "SafariViewController", package: "cordova-plugin-safariviewcontroller" },
                { assert: "BuildInfo", package: "cordova-plugin-buildinfo" },
                { assert: "cordova", package: "cordova" }
            ]);
        };

        self.$$buildAuthorization = function(permissions, settings) {
            var _settings = (settings || {});
            var scopes = (permissions || ["profile"]).join(","); //Scopes requested
            var response_type = "token"; //Better for javascript is token
            var redirect_uri = "oauth2/v2/connect/oauth2_callback.html?origin="; //Dummy redirect uri
            var state = (_settings.state || null); //some usefully text?
            var prompt = (_settings.prompt || "consent"); //Always show consent dialog

            //---------------------------------------------
            var api_url = self.getApiUrl();
            var host_url = (function() {
                var pathArray = api_url.split('/');
                var protocol = pathArray[0];
                var host = pathArray[2];
                var url = protocol + '//' + host;
                return url;
            })();
            var callback_url = api_url + redirect_uri + location.origin;
            var oauth2_url = (function(platform) {
                var fragments = [
                    self.getApiUrl(), "oauth2/v2/authorize",
                    "?response_type=", response_type,
                    "&client_id=", self.getAppId(),
                    "&scope=", scopes,
                    "&prompt=", prompt
                ];

                //Depend's on the platform , set bundle_id or redirect_uri
                switch (platform) {
                    case "ionic":
                        fragments.push("&bundle_id=" + BuildInfo.packageName);
                        break;
                    default:
                        fragments.push("&redirect_uri=" + callback_url);
                        break;
                }
                if (state) {
                    fragments.push("&state=" + state);
                }

                return fragments;
            })(_platform).join("");
            //---------------------------------------------

            return {
                oauth2Url: oauth2_url,
                hostToMatch: host_url,
                callbackUrl: callback_url,
                parser: parseFragment
            };
        };

        self.login = function(permissions, settings) {
            var defer = $q.defer();
            var oauth2 = self.$$buildAuthorization(permissions, settings);

            //URI to match
            switch (_platform) {
                case "ionic":
                    //WEEE NEED SUPPORT TO NTLM Authentication for Microsoft Active Directory
                    checkDependencies();

                    SafariViewController.isAvailable(function(available) {
                        if (available) {
                            SafariViewController.show({
                                url: oauth2.oauth2Url,
                                hidden: false, // default false. You can use this to load cookies etc in the background (see issue #1 for details).
                                animated: false // default true, note that 'hide' will reuse this preference (the 'Done' button will always animate though)
                            });

                            //Wee need to connect the "handlerURl", because
                            //with Safari Web view, wee can't get the URL opened 
                            //for security reason, so we need to use the 
                            //URL scheme strategy
                            //https://github.com/EddyVerbruggen/cordova-plugin-safariviewcontroller
                            window.handleOpenURL = function(url) {
                                SafariViewController.hide();
                                parseFragment(url).then(function(data) {
                                    defer.resolve(data);
                                }, function(e) {
                                    defer.reject(e);
                                });
                            };

                        } else {
                            //Open a Browser Plugin
                            var inApp_features = [
                                "toolbar=no",
                                "location=no",
                                "clearsessioncache=no",
                                "clearcache=no"
                            ].join(",");
                            var browser = cordova.InAppBrowser.open(oauth2.oauth2Url, '_blank', inApp_features);
                            browser.addEventListener('loadstop', function(e) {
                                if (e.url.indexOf(oauth2.callbackUrl) === 0) {
                                    parseFragment(e.url).then(function(data) {
                                        browser.close();
                                        defer.resolve(data);

                                    }, function(e) {
                                        browser.close();
                                        defer.reject(e);
                                    });
                                }
                            });
                        }
                    });
                    break;
                case "browser":
                    var height = 600;
                    var width = 650;
                    var left = (screen.width / 2) - (width / 2);
                    var top = (screen.height / 2) - (height / 2);
                    var browser_features = [
                        "toolbar=0",
                        "location=0",
                        "directories=0",
                        "status=0",
                        "menubar=0",
                        "scrollbars=0",
                        "resizable=0",
                        "copyhistory=0",
                        "width=" + width,
                        "height=" + height,
                        "top=" + top,
                        "left=" + left
                    ].join(",");

                    var finaly = false;
                    var windowElm = angular.element(window);
                    var opener = window.open(oauth2.oauth2Url, "oauth2_sso", browser_features);
                    var fn = function(e) {
                        if (!finaly && e.origin === oauth2.hostToMatch && e.data.indexOf(oauth2.callbackUrl) === 0) {
                            //AUTH SUCCESS OR ERROR
                            windowElm.unbind("message", fn);
                            parseFragment(e.data).then(function(data) {
                                defer.resolve(data);
                            }, function(e) {
                                defer.reject(e);
                            });
                            finaly = true;
                        }
                    };
                    windowElm.bind("message", fn);
                    break;
            }

            return defer.promise;
        };

        self.api = function(query) {
            var defer = $q.defer();
            var accessToken = self.getAccessToken();

            switch (query) {
                case "addresses":
                    query = "me/addresses";
                    break;
            }

            $Api.read("{sso_url}Accounts/{query}", {
                    sso_url: self.getApiUrl(),
                    query: query
                }, {
                    Authorization: "Bearer " + accessToken
                })
                .success(function(data) {
                    defer.resolve(data);
                })
                .error(function(err) {
                    defer.reject(err);
                });

            return defer.promise;
        };

        return self;
    }];
});
