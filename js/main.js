/*jslint browser: true*/
/*jslint nomen: true*/
/*global $, _, L, topojson*/

(function () {
    'use strict';

    var oem,
        data,

        Navigation,
        Status,
        Candidates,
        Map,

        SHAPEFILE = 'data/precinct-boundaries.json',
        DATA_PATHS = {
            vtd: 'data/vtd.csv',
            contests: 'data/contests.csv',
            candidates: 'data/candidates.csv',
            results: 'data/results.csv'
        };

    $(function () { oem.initialize(); });

    oem = {
        globals: {
            contest: '',
            initiative: false,
            filters: []
        },

        initialize: function () {
            var subscribeTo = data.subscribeTo;

            oem.map = new Map('map');

            data.updateAll(function (data) {
                oem.globals.contest = data.contests[0].id;

                oem.navigation = new Navigation('navigation', data.contests);
                oem.status = new Status('#status', data.results);
                oem.candidates = new Candidates('#candidates', data.candidates);
                oem.candidates.updateTally(data.results, oem.globals);
                oem.candidates.updateContest(oem.globals);

                oem.navigation.onChange = function (newContest) {
                    oem.globals.contest = newContest;
                    oem.globals.initiative = _.findWhere(data.contests, { id: newContest }).initiative;

                    oem.candidates.updateContest(oem.globals);
                };

                subscribeTo('results', oem.status.update);
                subscribeTo('results', oem.candidates.update);
            });
        }
    };

    data = (function () {
        var addSubscriber,
            update,
            updateAll,
            asyncCallsForPath,
            pathIfNotPath,
            subscribers = {},
            store = {};

        _(DATA_PATHS).values().each(function (path) {
            subscribers[path] = [];
            store[path] = {};
        });

        addSubscriber = function (path, callback) {
            var wrappedCallback;
            path = pathIfNotPath(path);

            wrappedCallback = function () { callback(store[path]); };
            subscribers[path].push(wrappedCallback);
        };

        update = function (paths, callback) {
            var wrappedCallback,
                ajaxSet = _.map(paths, asyncCallsForPath),
                subscribedCallbacks = _.reduce(paths, function (memo, path) {
                    return memo.concat(subscribers[path]);
                }, []);

            wrappedCallback = function () {
                var relabeled;
                if (callback) {
                    relabeled = _.object(_.keys(DATA_PATHS), _.values(store));
                    callback(relabeled);
                }
            };

            $.when.apply($, ajaxSet).done(subscribedCallbacks, wrappedCallback);
        };

        updateAll = function (callback) {
            update(_.values(DATA_PATHS), callback);
        };

        asyncCallsForPath = function (path) {
            path = pathIfNotPath(path);

            return $.ajax({
                dataType: 'text',
                url: path,
                success: function (csv) {
                    store[path] = $.csv.toObjects(csv);
                }
            });
        };

        pathIfNotPath = function (string) {
            if (string.match(/\./)) { return string; }

            return DATA_PATHS[string];
        };

        return {
            update: update,
            updateAll: updateAll,
            subscribeTo: addSubscriber
        };
    }());

    Map = function (el) {
        var map = this;

        this.superclass(el, {
            dragging: false,
            touchZoom: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            boxZoom: false,
            tap: false,
            keyboard: false,
            zoomControl: false,
            attributionControl: false
        });

        function initBoundaries(data) {
            var vtds = L.geoJson(topojson.feature(data, data.objects.precincts), {
                style: {
                    color: '#E8E6E5',
                    opacity: 1,
                    weight: 2,
                    fillColor: '#D4D1D0',
                    fillOpacity: 1
                }
            });

            map.fitBounds(vtds).addLayer(vtds);

            $(window).resize(function () { map.fitBounds(vtds); });
        }

        $.ajax({
            dataType: 'json',
            url: SHAPEFILE,
            success: initBoundaries
        });
    };

    Map.prototype = L.Map.prototype;
    Map.prototype.superclass = L.Map;

    Navigation = function (el, contests) {
        var navigation = this,
            $el = $(el),
            $ul = $('<ul>').appendTo($el);

        _.each(contests, function (contest, i) {
            var classes = i === 0 ? 'pill selected' : 'pill';
            $ul.append(
                $('<li>').append(
                    $('<a>')
                        .addClass(classes)
                        .data('contest', contest.id)
                        .text(contest.name)
                )
            );
        });

        $(el + ' a').click(function (e) {
            var target = $(e.target);

            if (!target.hasClass('selected')) {
                $(el + ' a').removeClass('selected');
                target.addClass('selected');
                navigation.onChange(target.data('contest'));
            }
        });
    };

    Navigation.prototype.onChange = function () { return undefined; };

    Status = function (el, results) {
        var status = this;

        status.update = function (results) {
            var reporting = status.reporting(results);
            $(el + ' .progress-bar .horizontal-bar').width((reporting * 100) + '%');
            $(el + ' span.label').text(
                Math.round(reporting * 100) + '% of precincts reporting'
            );
        };

        status.update(results);
    };

    Status.prototype.reporting = function (results) {
        var valid = _.filter(results, function (vtd) {
            return _(vtd).omit('vtd').some(function (val) {
                return val !== '';
            });
        });

        return valid.length / results.length;
    };

    Candidates = function (el, data) {
        this.$el = $(el);
        this.data = _.groupBy(data, 'contest');
    };

    Candidates.prototype.updateContest = function (globals) {
        var template = _.template($('#candidate-template').html()),
            $ul = this.$el.find('ul');

        $ul.empty();

        if (globals.initiative) {
            this.$el.addClass('initiative');
        } else {
            this.$el.removeClass('initiative');
        }

        _.each(this.data[globals.contest], function (candidate) {
            $ul.append(template(candidate));
        });
    };

    Candidates.prototype.updateTally = function (results, globals) {
        // Filter VTDs
        // Filter results on selected VTDs
        // Tally totals for each candidate in each contest
        // Write the results out to this.data
    };

    Candidates.prototype.update = function (results, globals) {
        this.updateTally(results, globals);
        // And then update display
    };

}());