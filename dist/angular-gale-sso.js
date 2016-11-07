/*------------------------------------------------------
 Company:           Gale Framework Ltda.
 Author:            David Gaete <dmunozgaete@gmail.com> (https://github.com/dmunozgaete)
 
 Description:       Angular Gale Single Sign On
 Github:            https://github.com/dmunozgaete/angular-gale-sso

 Versión:           1.0.0-rc.1
 Build Date:        2016-11-07 15:42:09
------------------------------------------------------*/

angular.module('gale-sso.templates', []).run(['$templateCache', function($templateCache) {
  "use strict";
  $templateCache.put("gale-sso/gale-sso.tpl.html",
    "<sso-loading ng-if=model.isLoading><sso-image><img src=\"data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz48c3ZnIHdpZHRoPSc3MnB4JyBoZWlnaHQ9JzcycHgnIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmlld0JveD0iMCAwIDEwMCAxMDAiIHByZXNlcnZlQXNwZWN0UmF0aW89InhNaWRZTWlkIiBjbGFzcz0idWlsLXJpbmctYWx0Ij48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0ibm9uZSIgY2xhc3M9ImJrIj48L3JlY3Q+PGNpcmNsZSBjeD0iNTAiIGN5PSI1MCIgcj0iNDAiIHN0cm9rZT0ibm9uZSIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIxMCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIj48L2NpcmNsZT48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0MCIgc3Ryb2tlPSIjMDA3MGQxIiBmaWxsPSJub25lIiBzdHJva2Utd2lkdGg9IjYiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCI+PGFuaW1hdGUgYXR0cmlidXRlTmFtZT0ic3Ryb2tlLWRhc2hvZmZzZXQiIGR1cj0iM3MiIHJlcGVhdENvdW50PSJpbmRlZmluaXRlIiBmcm9tPSIwIiB0bz0iNTAyIj48L2FuaW1hdGU+PGFuaW1hdGUgYXR0cmlidXRlTmFtZT0ic3Ryb2tlLWRhc2hhcnJheSIgZHVyPSIzcyIgcmVwZWF0Q291bnQ9ImluZGVmaW5pdGUiIHZhbHVlcz0iMTUwLjYgMTAwLjQ7MSAyNTA7MTUwLjYgMTAwLjQiPjwvYW5pbWF0ZT48L2NpcmNsZT48L3N2Zz4=\"></sso-image><sso-title>Iniciando Plataforma</sso-title><sso-legend>Espere por favor...</sso-legend></sso-loading><iframe frameborder=0 border=0 cellspacing=0 ng-show=!model.isLoading></iframe>");
}]);
;angular.manifiest('gale-sso', [
    'gale-sso.templates',
    'gale-sso.components',
    'gale-sso.services'
], [
    'gale' //ANGULAR GALE CORE LIBRARY
]);
;angular.module('gale-sso.components')

.directive('galeSso', ['$log', '$q', '$cordovaSingleSignOn', function($log, $q, $cordovaSingleSignOn) {
    return {
        restrict: 'E',
        scope: {
            onLoginSuccess: '&',
            onLoginError: '&',
            scopes: '='
        },
        templateUrl: 'gale-sso/gale-sso.tpl.html',
        controller: ['$scope', '$element', '$q', '$timeout', function(
            $scope,
            $element,
            $q,
            $timeout
        ) {
            var vm = $scope.model = {
                isLoading: true
            };

            var _scopes = ($scope.scopes || ["profile"]);
            var oauth2 = $cordovaSingleSignOn.$$buildAuthorization(_scopes);

            var iframe = $element.find("iframe");
            iframe.attr("src", oauth2.oauth2Url);

            var isLoaded = false;
            iframe.bind("load", function() {
                if (isLoaded) {
                    return false; //EVERY FRAME , LOAD, IS CALLED...
                }
                var delay = $timeout(function() {
                    $timeout.cancel(delay);
                    isLoaded = true;

                    vm.isLoading = false;
                    var finaly = false;
                    var windowElm = angular.element(window);

                    var fn = function(e) {
                        if (!finaly && e.origin === oauth2.hostToMatch && e.data.indexOf(oauth2.callbackUrl) === 0) {
                            //AUTH SUCCESS OR ERROR
                            windowElm.unbind("message", fn);
                            oauth2.parser(e.data).then(function(data) {
                                var handler = $scope.onLoginSuccess();
                                if (handler) {
                                    handler(data);
                                }
                            }, function(e) {
                                var handler = $scope.onLoginError();
                                if (handler) {
                                    handler(e);
                                }
                            });
                            finaly = true;
                        }
                    };
                    windowElm.bind("message", fn);


                }, 10);

            });

            //Garbage Collector Destroy
            $scope.$on('$destroy', function() {

            });
        }]
    };
}]);
;angular.module('gale-sso.services')

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

    this.$get = ['$q', '$Api', '$Identity', function($q, $Api, $Identity) {
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
                    parsed.resolve({
                        authResponse: j1,
                        status: "connected"
                    });
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
            var state = null; //some usefully text?
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
            var oauth2_url = [
                self.getApiUrl(), "oauth2/v2/auth",
                "?response_type=", response_type,
                "&client_id=", self.getAppId(),
                "&redirect_uri=", callback_url,
                "&scope=", scopes,
                "&prompt=", prompt,
                "&state=", state
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
    }];
});
