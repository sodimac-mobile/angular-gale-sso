angular.module('gale-sso.components')

.directive('galeSso', function($log, $q, $cordovaSingleSignOn) {
    return {
        restrict: 'E',
        scope: {
            onLoginSuccess: '&',
            onLoginError: '&',
            scopes: '='
        },
        templateUrl: 'gale-sso/gale-sso.tpl.html',
        controller: function(
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
        }
    };
});
