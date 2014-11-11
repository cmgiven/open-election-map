Created by [Code for DC](http://codefordc.org). Published as a public domain work under the [CC0 License](http://creativecommons.org/publicdomain/zero/1.0/).

# So you want a election map?

### You will need
* A topojson file showing the boundaries of voting districts in your jurisdiction. You'll probably need to find a shapefile (.shp) of these boundaries, perhaps from a board of elections or government data portal, and convert it to the topojson format (look in the 'Converting Data' section of this [useful tutorial](http://bost.ocks.org/mike/map/)). Save this file as data/precinct-boundaries.json.
* A Google Spreadsheet matching the format of [this one](https://docs.google.com/spreadsheets/d/1xZXetat3Up0qHRJfRs8jQIlTJgRT9zzuAEAlyZ-p4RU/edit#gid=0), but with your own candidates and results. A starting point for demographic data about voting districts is the US Census Bureau's [American FactFinder](http://factfinder2.census.gov/faces/nav/jsf/pages/index.xhtml) website, where you'll need to select the geographic type 'Voting District' from the advanced search interface.

### You can easily customize
* The header and footer in the index.html file.
* The Google Analytics tracking code in the index.html file.
* The location of your Google Spreadsheet in the update-data.rb file.
* The REFRESH_DELAY in the js/main.js file to enable automatic refreshing of data.
* The TOOLTIP_DESCRIPTION in the js/main.js file to customize how a voting district is identified with additional information from the vtd spreadsheet (i.e. to describe "Precinct 48" as "North Springfield").
* The AVAILABLE_FILTERS in the js/main.js file to customize the filtering options based on the data you have available.

### To get started
* Easiest way to host the map is by using [Github Pages](https://pages.github.com).
* Run the command ```./update-data.rb``` from the project directory in order to grab the latest data from your Google Spreadsheet (you'll either need a Mac or need a Linux machine with Ruby installed). Alternatively, you can download your Google Spreadsheet as a CSV file and replace the data in the data/ directory.