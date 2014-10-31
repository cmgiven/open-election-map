(function () {
    'use strict';

    var precincts,
    	map = L.map('map', {
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

    function initMap(data) {
    	precincts = L.geoJson(topojson.feature(data, data.objects.precincts), {
		    style: {
		        color: '#E8E6E5',
		        opacity: 1,
		        weight: 2,
		        fillColor: '#D4D1D0',
		        fillOpacity: 1
		    }
	    });

    	map.fitBounds(precincts).addLayer(precincts);
    }

    $(function () {
	    $.ajax({
	        dataType: 'json',
	        url: 'data/precinct-boundaries.json',
	        data: {},
	        async: false,
	        success: function (data) { initMap(data); }
	    });  

		$(window).resize(function() {
			map.fitBounds(precincts);
		});
    });
}());