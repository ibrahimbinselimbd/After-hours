# Visitor country marker data

The homepage marker uses an on-server, local-only country-prefix lookup. It does not call a geolocation API. The server reads the request IP in memory, matches it against `ip-country-prefixes.txt.gz`, converts only the resulting country code to a Natural Earth label point, and returns that country code and its approximate coordinates. The IP itself is not included in the response or stored by this feature. The Nginx route is configured with access logging disabled.

The prefix snapshot was retrieved on 2026-11-24 from [ipverse/geo-ip-blocks](https://github.com/ipverse/geo-ip-blocks), a daily-updated dataset of IPv4 and IPv6 network-registration prefixes released under CC0 1.0. Its own documentation notes that registration country can differ from where traffic actually originates. VPNs, proxies, mobile carriers, and reassigned networks can therefore put the heart in the wrong country or leave it unset. This feature estimates country only; it does not locate an individual or household.

`country-centroids.json` contains Natural Earth label points, taken from the public-domain 1:10m Admin-0 Countries dataset. A small set of legacy and remote territory codes absent from that dataset have representative island coordinates in the JSON. These points are approximate and are used only to place the decorative heart on the globe.

`ip-country-prefixes.txt.gz` is a reviewed local snapshot kept outside `site/`, so it is not served to visitors. Refresh it by downloading a newer CC0 snapshot from the upstream source, reviewing/regenerating the compressed prefix file and country coordinates, and rerunning the tests before deployment. Visitor requests never download or contact the upstream data source.
