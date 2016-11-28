angular.module('gale-sso.services')

.provider('$cordovaSingleSignOn', function() {
    var $this = this;

    //Configurable Variable on .config Step
    var _appId = null;
    var _ssoBaseURL = null;
    var _ssoLabel = "$sso:perApp:state";

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

    this.$get = function($q, $Api, $Identity, $LocalStorage) {
        var self = this;
        var _authResponse = null;

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
            var qs = uri.substring(uri.indexOf("#") + 1).split("&");

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

                    //IN IOS browser (or webview inside a Cordova)
                    //the cookie is not shared... A BIG BIG PROBLEM!!!
                    // TRICK SOLUTION:
                    //  Send the bearer token setted in the first login :P,
                    //  the result is the app show the login only the first time
                    //  per application , and not cross-app which is the initial
                    //  intention.....
                    //SET THE BEARER TOKEN IN LOCALSTORAGE FOR 
                    //IOS BUG... IN COOKIE
                    $LocalStorage.setObject(_ssoLabel, result);

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

        self.$$buildAuthorization = function(permissions, settings) {
            var _settings = (settings || {});
            var scopes = permissions.join(","); //Scopes requested
            var response_type = "token"; //Better for javascript is token
            var redirect_uri = "oauth2/v2/connect/oauth2_callback.html?origin="; //Dummy redirect uri
            var state = (_settings.state || null); //some usefully text?
            var prompt = (_settings.prompt || "consent"); //Always show consent dialog

            //---------------------------------------------
            //IN IOS browser (or webview inside a Cordova)
            //the cookie is not shared... A BIG BIG PROBLEM!!!
            // TRICK SOLUTION:
            //  Send the bearer token setted in the first login :P,
            //  the result is the app show the login only the first time
            //  per application , and not cross-app which is the initial
            //  intention.....
            var curr_bearerToken = ($LocalStorage.getObject(_ssoLabel) || null);
            if (curr_bearerToken) {
                //GET THE BEARER TOKEN IN LOCALSTORAGE FOR 
                //IOS BUG... IN COOKIE
                curr_bearerToken = curr_bearerToken.authResponse.access_token;
            }
            //---------------------------------------------

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
            var oauth2_url = [
                self.getApiUrl(), "oauth2/v2/auth",
                "?response_type=", response_type,
                "&client_id=", self.getAppId(),
                "&redirect_uri=", callback_url,
                "&scope=", scopes,
                "&prompt=", prompt,
                "&state=", state,
                "&_wbvf=", curr_bearerToken // WEB VIEW IOS FIX
            ].join("");
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
            var mode = typeof ionic === "object" ? "ionic" : "browser";

            //Check if Develop in a browser :P
            if (mode === "ionic") {
                //If Not in WebView (Device) , set mode browser
                if (!ionic.Platform.isWebView()) {
                    mode = "browser";
                }
            }

            var oauth2 = self.$$buildAuthorization(permissions, settings);


            //URI to match
            switch (mode) {
                case "ionic":
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
    };
});
