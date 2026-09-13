# Run after `bundle exec jekyll build`; optional arguments: output directory, baseurl.
require 'cgi'
require 'uri'
require 'rexml/document'
require 'yaml'

root = File.expand_path(ARGV[0] || '_site')
config = YAML.safe_load_file('_config.yml')
base = ARGV[1] || config.fetch('baseurl', '')
origin = config.fetch('url').delete_suffix('/')
errors = []
pages = Dir.glob("#{root}/**/*.html")
%w[index.html work/index.html blog/index.html about/index.html blog/hello-world/index.html 404.html].each do |page|
  errors << "Missing page: #{page}" unless File.file?("#{root}/#{page}")
end

pages.each do |file|
  html = File.read(file)
  relative = file.delete_prefix(root)
  page_path = relative.sub(/index\.html$/, '')
  errors << "Expected one H1: #{relative}" unless html.scan(/<h1\b/).size == 1
  errors << "Unrendered Liquid: #{relative}" if html.include?('{%') || html.include?('{{')
  errors << "Missing skip link: #{relative}" unless html.include?('href="#main"')
  errors << "Wrong canonical: #{relative}" unless html.include?("href=\"#{origin}#{base}#{page_path}\"")
  html.scan(/\b(?:href|src)="([^"]+)"/).flatten.each do |attribute|
    link = CGI.unescapeHTML(attribute)
    next if link.match?(/\A(?:[a-z][a-z0-9+.-]*:|\/\/)/i)
    url = URI.join("https://local.test#{base}#{page_path}", link)
    path = URI::DEFAULT_PARSER.unescape(url.path)
    unless base.empty? || path.start_with?("#{base}/")
      errors << "Link escapes baseurl: #{relative} → #{link}"
      next
    end
    target = File.join(root, path.delete_prefix(base).delete_prefix('/'))
    target = File.join(target, 'index.html') if File.directory?(target)
    unless File.file?(target)
      errors << "Broken link: #{relative} → #{link}"
      next
    end
    if url.fragment && !url.fragment.empty? && File.extname(target) == '.html'
      fragment = URI::DEFAULT_PARSER.unescape(url.fragment)
      errors << "Missing fragment: #{relative} → #{link}" unless File.read(target).include?("id=\"#{fragment}\"")
    end
  end
end

post = File.read("#{root}/blog/hello-world/index.html") if File.file?("#{root}/blog/hello-world/index.html")
errors << 'Original Markdown post was not rendered' unless post&.include?('<p>Welcome to my new personal corner of the internet.</p>')
%w[feed.xml sitemap.xml].each do |name|
  begin
    xml = File.read("#{root}/#{name}")
    REXML::Document.new(xml)
    errors << "Post URL missing from #{name}" unless xml.include?("#{origin}#{base}/blog/hello-world/")
  rescue StandardError => error
    errors << "#{name}: #{error.message}"
  end
end
abort errors.join("\n") unless errors.empty?
puts "Passed: #{pages.size} pages, local links, fragments, Markdown, RSS, and sitemap (baseurl: #{base.inspect})."
