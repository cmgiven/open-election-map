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
        Filter,
        Legend,

        SHAPEFILE = 'data/precinct-boundaries.json',
        DATA_PATHS = {
            vtd: 'data/vtd.csv',
            contests: 'data/contests.csv',
            candidates: 'data/candidates.csv',
            results: 'data/results.csv'
        };

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

    $(function () { app.initialize(); });

    app = {
        globals: {
            contest: '',
            initiative: false,
            view: 'winner',
            filteredVTDs: []
        },

        initialize: function () {
            var subscribeTo = data.subscribeTo;

            app.map = new Map('map', app);
            app.filter = new Filter('.options .filter');

            data.updateAll(function (data) {
                app.globals.contest = data.contests[0].id;
                app.globals.filteredVTDs = app.filter.filteredVTDs(data.vtd);

                app.navigation = new Navigation('navigation', data.contests);
                app.status = new Status('#status', data.results);
                app.candidates = new Candidates('#candidates', data, app.globals);
                app.candidates.updateTally(data.results, app.globals);
                app.candidates.updateContest(app.globals);
                app.map.results = data.results;
                app.map.candidates = _.where(data.candidates, { contest: app.globals.contest });
                app.map.fireEvent('update', app.globals);
                app.legend = new Legend('#legend', data.candidates, app.globals.contest);


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

                    app.legend.updateContest(newContest);

                    app.map.candidates = _.where(data.candidates, { contest: app.globals.contest });
                    app.map.fireEvent('update', app.globals);
                };

                app.filter.onChange = function () {
                    app.globals.filteredVTDs = app.filter.filteredVTDs(data.vtd);
                    app.candidates.update(data.results, app.globals);
                    app.map.fireEvent('update', app.globals);
                };

                subscribeTo('results', app.status.update);
                subscribeTo('results', app.candidates.update);
            });
        }
    };

    Legend = function (el, candidates, contest) {
        this.$el = $(el);
        this.candidates = candidates;
        this.updateContest(contest);
    };

    Legend.prototype.updateContest = function (contest) {
        var legend = this,
            candidates = _.filter(legend.candidates, function (candidate) {
                return !(candidate.other) && candidate.contest === contest;
            }),
            header = '<div class="line legend-header"><div class="name"></div><div class="legend-divider">60%</div><div class="legend-divider">70%</div><div class="legend-divider">80%</div></div>';

        legend.$el.empty();

        legend.$el.append(header);

        _.each(candidates, function (candidate) {
            var div = $('<div class="line">');

            div.append($('<div class="name">').text(candidate.last_name));
            div.append($('<div class="legend-box">').css('background', interpolateHex(candidate.color, '#D4D1D0', 0.25)));
            div.append($('<div class="legend-box">').css('background', interpolateHex(candidate.color, '#D4D1D0', 0.5)));
            div.append($('<div class="legend-box">').css('background', interpolateHex(candidate.color, '#D4D1D0', 0.75)));
            div.append($('<div class="legend-box">').css('background', candidate.color));

            legend.$el.append(div);
        });
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

    Map = function (el, app) {
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

                        layer.on({
                            mouseover: mouseover,
                            mouseout: mouseout
                        });
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

                                map.marginCircles.addLayer(L.circle(layer.getBounds().getCenter(), Math.sqrt(margin / maxMargin / 3.14) * 1000, {
                                    color: winnerColor,
                                    fillOpacity: 0.75,
                                    stroke: false
                                }).on({
                                    mouseover: function (e) {
                                        e.target.setStyle({ stroke: true });
                                        app.candidates.update(map.results, { filteredVTDs: [feature.id] });
                                    },
                                    mouseout: function (e) {
                                        e.target.setStyle({ stroke: false });
                                        app.candidates.update(map.results);
                                    }
                                }));
                            }
                        }

                        layer.off('mouseover');
                        layer.off('mouseout');
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
                            layer.setStyle({ fillColor: '#E4E1E0' });
                        }
                    };

                    mouseover = function (e) {
                        e.target.setStyle({ weight: 4 });
                        app.candidates.update(map.results, { filteredVTDs: [feature.id] });
                    };

                    mouseout = function (e) {
                        e.target.setStyle({ weight: 2 });
                        app.candidates.update(map.results);
                    };

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
                if (navigation.onChange) { navigation.onChange(target.data('contest')); }
            }
        });
    };

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

    Candidates = function (el, data, globals) {
        var $el = $(el);
        this.$el = $el;
        this.globals = globals;
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
        var sorted,
            candidates = this.contests[globals.contest],
            template = _.template($('#candidate-template').html()),
            $ul = this.$el.find('ul');

        this.$el.find('a.action').removeClass('expanded').html('Show more +');

        $ul.empty();

        if (globals.initiative) {
            this.$el.addClass('initiative');
        } else {
            this.$el.removeClass('initiative');
        }

        if (candidates[0].tally) {
            sorted = _.sortBy(candidates, 'tally').reverse();
        } else {
            sorted = candidates;
        }

        _.each(sorted, function (candidate) { $ul.append(template(candidate)); });
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
        var options = globals ? _.defaults(globals, this.globals) : this.globals;

        this.updateTally(results, options);
        this.updateContest(options); // You can do better than this.
    };

    Filter = function (el) {
        var filter = this,
            $el = $(el),
            $ul = $('<ul>').appendTo($el);

        filter.filters = [];

        _.each(filter.availableFilters, function (options, key) {
            $ul.append(
                $('<li>').append(
                    $('<a>')
                        .addClass('pill')
                        .data('filter', key)
                        .text(options.name)
                )
            );
        });

        function updateDescription(options) {
            $('.filter-controls p.description').text('Precincts ' +
                options.description +
                (options.direction === 'gt' ? ' at least:' : ' less than:'));
        }

        $(el + ' ul a').click(function (e) {
            var target = $(e.target),
                key = target.data('filter'),
                options = filter.availableFilters[key];

            filter.filters = [];

            if (target.hasClass('selected')) {
                target.removeClass('selected');
                $('.filter-controls').slideUp(300);
            } else {
                options = _.defaults(options, {
                    min: 0,
                    max: 100,
                    step: 1,
                    units: 'percent',
                    divider: 50,
                    direction: 'gt'
                });

                $(el + ' a').removeClass('selected');
                target.addClass('selected');

                updateDescription(options);

                $('.filter-controls .slider input').attr({
                    min: options.min,
                    max: options.max,
                    step: options.step
                }).val(options.divider);
                $('.filter-controls .slider span.label').attr('data-units', options.units).text(options.divider);
                $('.filter-controls').slideDown(300);

                $('.slider input[type="range"]').off('input change');
                $('.slider input[type="range"]').on('input change', function (e) {
                    var newValue = $(e.target).val();
                    $('.slider .label').text(newValue);
                    options.divider = newValue;
                    filter.filters = [];
                    filter.applyFilter(options);
                    if (filter.onChange) { filter.onChange(); }
                });

                $('#reverse-direction').off('click');
                $('#reverse-direction').on('click', function () {
                    options.direction = options.direction === 'gt' ? 'lt' : 'gt';
                    updateDescription(options);
                    filter.filters = [];
                    filter.applyFilter(options);
                    if (filter.onChange) { filter.onChange(); }
                });

                filter.applyFilter(options);
            }

            if (filter.onChange) { filter.onChange(); }
        });

        $('a#clear-filter').click(function () {
            $(el + ' a').removeClass('selected');
            filter.filters = [];
            $('.filter-controls').slideUp(300);
            if (filter.onChange) { filter.onChange(); }
        });
    };

    Filter.prototype.availableFilters = {
        black: {
            name: 'Black Areas',
            column: 'PctBlackNonHispBridge_2010',
            description: "with a black population of"
        },
        white: {
            name: 'White Areas',
            column: 'PctWhiteNonHispBridge_2010',
            description: "with a white population of"
        },
        hispanic: {
            name: 'Hispanic Areas',
            column: 'PctHisp_2010',
            description: "with an Hispanic population of",
            divider: 25
        },
        homeowners: {
            name: 'Homeowners',
            column: 'PctOwnerOccupiedHsgUnits_2007_11',
            description: "where the percentage of homes occupied by the owner is"
        },
        income: {
            name: 'Avg Income',
            column: 'AvgFamilyIncAdj_2007_11',
            description: "where the average family income is",
            units: 'dollars',
            min: 25000,
            max: 200000,
            step: 2500,
            divider: 60000,
            direction: 'lt'
        },
        unemployment: {
            name: 'Unemployment',
            column: 'PctUnemployed_2007_11',
            description: "where the unemployment rate is",
            min: 0,
            max: 30,
            step: 0.5,
            divider: 7.5
        },
        bowser: {
            name: 'Bowser Primary Vote',
            column: 'DemPrimary14_Bowser',
            description: "where Muriel Bowser's vote share in the Democratic primary was"
        },
        gray: {
            name: 'Gray Primary Vote',
            column: 'DemPrimary14_Gray',
            description: "where Vincent Gray's vote share in the Democratic primary was"
        },
        fenty: {
            name: 'Fenty 2010 Primary Vote',
            column: 'DemPrimary10_Fenty',
            description: "where Adrian Fenty's vote share in the 2010 Democratic primary was"
        }
    };

    Filter.prototype.applyFilter = function (options) {
        this.filters.push(function (vtd) {
            if (options.direction === 'gt') { return parseInt(vtd[options.column], 10) >= options.divider; }
            return parseInt(vtd[options.column], 10) < options.divider;
        });
    };

    Filter.prototype.filteredVTDs = function (vtds) {
        var filter = this;
        return _(vtds).filter(function (vtd) {
            var pass = true;
            _.each(filter.filters, function (filter) {
                if (!filter(vtd)) { pass = false; }
            });
            return pass;
        }).pluck('vtd').value();
    };

}());