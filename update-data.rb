#!/usr/bin/env ruby

# Downloads data from a Google Spreadsheet and pushes an automatic commit.
# Execute by running the command './update-data.rb' from your project directory.

require 'open-uri'
require 'digest/md5'

OpenURI::Buffer.send :remove_const, 'StringMax' if OpenURI::Buffer.const_defined?('StringMax')
OpenURI::Buffer.const_set 'StringMax', 40960

# Update these constants to your Google Spreadsheet.
SHEET_ID = '1xZXetat3Up0qHRJfRs8jQIlTJgRT9zzuAEAlyZ-p4RU'
GIDS = {
	'results' => '0',
	'vtd' => '1722258999',
	'candidates' => '222813760',
	'contests' => '1654121249'
}

# Values can be found in the URL of your Google Spreadsheet.
# Example: https://docs.google.com/spreadsheets/d/1xZXetat3Up0qHRJfRs8jQIlTJgRT9zzuAEAlyZ-p4RU/edit#gid=0
#                                                 ********************************************          *

def get_google_sheet (gid)
	open("https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/export?format=csv&id=" + SHEET_ID + "&gid=" + gid).string
end

changed_files = []

GIDS.each do |sheet, gid|
	path = 'data/' + sheet + '.csv'

	old_hash = Digest::MD5.hexdigest(IO.read(path))

	latest_data = get_google_sheet(gid)
	new_hash = Digest::MD5.hexdigest(latest_data)

	if new_hash != old_hash then
		File.open(path, 'w') do |f|
			f.write(latest_data)
		end
		changed_files.push(path)
		puts "Updated " + path
	end
end

if changed_files.length > 0 then
	files = changed_files.join(' ')
	message = 'Auto-update data'

	`git add #{files}`
	`git commit -m #{message}`
	`git push`
	`git push -f origin master:gh-pages`
end