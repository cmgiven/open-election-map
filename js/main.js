/*jslint browser: true*/
/*jslint nomen: true*/
/*global $, _, L, topojson*/

(function () {
    'use strict';

    var app,
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

    $(function () { app.initialize(); });

    app = {
        globals: {
            contest: '',
            initiative: false,
            view: 'winner',
            filteredVTDs: []
        },

        filters: [],

        initialize: function () {
            var subscribeTo = data.subscribeTo;

            app.map = new Map('map');

            data.updateAll(function (data) {
                app.globals.contest = data.contests[0].id;
                app.globals.filteredVTDs = _(data.vtd).filter(function (vtd) {
                    _.each(app.filters, function (filter) {
                        if (!filter(vtd)) { return false; }
                    });
                    return true;
                }).pluck('vtd').value();

                app.navigation = new Navigation('navigation', data.contests);
                app.status = new Status('#status', data.results);
                app.candidates = new Candidates('#candidates', data);
                app.candidates.updateTally(data.results, app.globals);
                app.candidates.updateContest(app.globals);
                app.map.results = data.results;
                app.map.candidates = _.where(data.candidates, { contest: app.globals.contest });
                app.map.fireEvent('update', app.globals);


                $('.options .view a').click(function (e) {
                    var target = $(e.target);

                    if (!target.hasClass('selected')) {
                        $('.options .view a.selected').removeClass('selected');
                        target.addClass('selected');
                        app.globals.view = target.data('view');
                        app.map.fireEvent('update', app.globals);
                    }
                });

                app.navigation.onChange = function (newContest) {
                    app.globals.contest = newContest;
                    app.globals.initiative = _.findWhere(data.contests, { id: newContest }).initiative;

                    app.candidates.updateContest(app.globals);

                    app.map.candidates = _.where(data.candidates, { contest: app.globals.contest });
                    app.map.fireEvent('update', app.globals);
                };

                subscribeTo('results', app.status.update);
                subscribeTo('results', app.candidates.update);
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

        this.results = this.results || {};
        this.candidates = this.candidates || {};

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

        this.marginCircles = L.layerGroup().addTo(map);

        function calculateMaxMargin(results, candidates) {
            var max = 0;

            _.each(results, function (vtd) {
                var totals = _(vtd).pick(candidates)
                        .values()
                        .map(function (str) { return parseInt(str, 10); })
                        .value().sort(function (a, b) { return b - a; }),
                    margin = totals[0] - totals[1];

                max = isNaN(margin) ? max : Math.max(max, margin);
            });

            map.maxMargin = max;
            return max;
        }

        map.on({ update: function () { map.marginCircles.clearLayers(); map.maxMargin = undefined; }});

        function initBoundaries(json) {
            map.vtds = L.geoJson(topojson.feature(json, json.objects.precincts), {
                style: {
                    color: '#E8E6E5',
                    opacity: 1,
                    weight: 2,
                    fillColor: '#D4D1D0',
                    fillOpacity: 1
                },
                onEachFeature: function (feature, layer) {
                    var displayWinner, displayMargin, update, mouseover, mouseout;

                    function interpolateHex(hex1, hex2, distance) {
                        // But it works.
                        var r1 = parseInt(hex1.substr(1, 2), 16),
                            g1 = parseInt(hex1.substr(3, 2), 16),
                            b1 = parseInt(hex1.substr(5, 2), 16),
                            r2 = parseInt(hex2.substr(1, 2), 16),
                            g2 = parseInt(hex2.substr(3, 2), 16),
                            b2 = parseInt(hex2.substr(5, 2), 16),
                            r = Math.round(r2 + (r1 - r2) * distance).toString(16),
                            g = Math.round(g2 + (g1 - g2) * distance).toString(16),
                            b = Math.round(b2 + (b1 - b2) * distance).toString(16);

                        return '#' + (r.length === 2 ? r : '0' + r) + (g.length === 2 ? g : '0' + g) + (b.length === 2 ? b : '0' + b);
                    }

                    function cutscores(d) {
                        /*jslint white: true */
                        return d > 0.8 ? 1    :
                               d > 0.7 ? 0.75 :
                               d > 0.6 ? 0.5  :
                                         0.25 ;
                    }

                    displayWinner = function () {
                        if (!_.isEmpty(map.candidates) && !_.isEmpty(map.results)) {
                            var winnerColor,
                                votesCast,
                                vtdResults = _.findWhere(map.results, { vtd: feature.id }),
                                contestResults = _(vtdResults).pick(_.pluck(map.candidates, 'id'))
                                    .map(function (v, k) { var pair = []; pair[0] = k; pair[1] = parseInt(v, 10); return pair; })
                                    .sortBy(function (pair) {
                                        return -pair[1];
                                    }).value(),
                                winner = contestResults[0][0],
                                winnerTally = contestResults[0][1],
                                tie = contestResults[0][1] === contestResults[1][1];

                            if (winnerTally && !tie) {
                                winnerColor = _.findWhere(map.candidates, { id: winner }).color;
                                winnerColor = winnerColor === '' ? '#D4D1D0' : winnerColor;

                                votesCast = _(contestResults).values().reduce(function (memo, pair) { return memo + pair[1]; }, 0);

                                layer.setStyle({ fillColor: interpolateHex(winnerColor, '#D4D1D0', cutscores(winnerTally / votesCast)) });
                            } else {
                                layer.setStyle({ fillColor: '#D4D1D0' });
                            }
                        }
                    };

                    displayMargin = function () {
                        if (!_.isEmpty(map.candidates) && !_.isEmpty(map.results)) {
                            var winnerColor,
                                vtdResults = _.findWhere(map.results, { vtd: feature.id }),
                                contestResults = _(vtdResults).pick(_.pluck(map.candidates, 'id'))
                                    .map(function (v, k) { var pair = []; pair[0] = k; pair[1] = parseInt(v, 10); return pair; })
                                    .sortBy(function (pair) {
                                        return -pair[1];
                                    }).value(),
                                winner = contestResults[0][0],
                                margin = contestResults[0][1] - contestResults[1][1],
                                maxMargin = map.maxMargin || calculateMaxMargin(map.results, _.pluck(map.candidates, 'id'));

                            layer.setStyle({ fillColor: '#D4D1D0' });

                            if (margin > 0) {
                                winnerColor = _.findWhere(map.candidates, { id: winner }).color;
                                winnerColor = winnerColor === '' ? '#D4D1D0' : winnerColor;

                                map.marginCircles.addLayer(L.circle(layer.getBounds().getCenter(), margin / maxMargin * 800, {
                                    color: winnerColor,
                                    fillOpacity: 0.75,
                                    stroke: 0
                                }));
                            }
                        }
                    };

                    update = function (globals) {
                        if (_.contains(globals.filteredVTDs, feature.id)) {
                            switch (globals.view) {
                            case 'winner':
                                displayWinner();
                                break;
                            case 'margin':
                                displayMargin();
                                break;
                            }
                        } else {
                            layer.setStyle({ fillColor: '#D4D1D0' });
                        }
                    };

                    mouseover = function (e) {
                        e.target.setStyle({ weight: 4 });
                    };

                    mouseout = function (e) {
                        e.target.setStyle({ weight: 2 });
                    };

                    layer.on({
                        mouseover: mouseover,
                        mouseout: mouseout
                    });

                    map.on({
                        update: update
                    });

                    displayWinner();
                }
            });

            map.fitBounds(map.vtds).addLayer(map.vtds);

            $(window).resize(function () { map.fitBounds(map.vtds); });
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
                Math.floor(reporting * 100) + '% of precincts reporting'
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
        var $el = $(el);
        this.$el = $el;
        this.contests = _.groupBy(data.candidates, 'contest');
        this.vtds = data.vtd;

        $el.find('a.action').click(function (e) {
            var target = $(e.target);

            target.toggleClass('expanded');

            if (target.hasClass('expanded')) {
                target.html('Show less &ndash;');
                $el.find('li.candidate.other')
                    .wrapAll('<div class="revealer" style="display: none;">')
                    .show()
                    .parent()
                    .slideDown(300, function () {
                        $(this).children().unwrap();
                    });
            } else {
                target.html('Show more +');
                $el.find('li.candidate.other')
                    .wrapAll('<div class="revealer">')
                    .parent()
                    .slideUp(300, function () {
                        $(this).children().hide().unwrap();
                    });
            }
        });
    };

    Candidates.prototype.updateContest = function (globals) {
        var template = _.template($('#candidate-template').html()),
            $ul = this.$el.find('ul');

        this.$el.find('a.action').removeClass('expanded').html('Show more +');

        $ul.empty();

        if (globals.initiative) {
            this.$el.addClass('initiative');
        } else {
            this.$el.removeClass('initiative');
        }

        _(this.contests[globals.contest]).sortBy('tally').reverse()
            .each(function (candidate) {
                $ul.append(template(candidate));
            });
    };

    Candidates.prototype.updateTally = function (results, globals) {
        var contests = this.contests,

            filteredResults = _.filter(results, function (vtd) {
                return _.contains(globals.filteredVTDs, vtd.vtd);
            }),

            candidates = _(results[0]).keys().without('vtd').value(),

            tallies = _.object(candidates, _.map(candidates,
                function (candidate) {
                    return _.reduce(filteredResults, function (tally, vtd) {
                        var votes = parseInt(vtd[candidate], 10);
                        return tally + (isNaN(votes) ? 0 : votes);
                    }, 0);
                }));

        _.each(contests, function (candidates) {
            var contestTallies = _.pick(tallies, _.pluck(candidates, 'id')),
                totalVotes = _.reduce(contestTallies, function (total, candidate) {
                    return total + candidate;
                }, 0),
                maxVotes = _(contestTallies).values().max().value();

            _.each(candidates, function (candidate) {
                candidate.tally = contestTallies[candidate.id];
                candidate.totalVotes = totalVotes;
                candidate.maxVotes = maxVotes;
            });
        });
    };

    Candidates.prototype.update = function (results, globals) {
        this.updateTally(results, globals);
        // And then update display
    };

}());