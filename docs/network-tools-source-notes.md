# Network tools: sources and interpretation notes

The network checks run only after a visitor presses Run. Live requests originate from the visitor's browser and go directly to the named service; the ByteAfter site does not proxy the request. The source and observation time are shown in results where available. Public services can be unavailable, rate-limited, or return different answers; failed actions are not charged.

## IP and location

- [ipify](https://www.ipify.org/) documents `api.ipify.org`, `api4.ipify.org`, `api6.ipify.org` and `api64.ipify.org`. These endpoints return the address visible to that service. This is the public egress address and may be a VPN, proxy, carrier-NAT or gateway address; it is not the device's private LAN address.
- [IPWho.is / IPWhois.io API documentation](https://ipwhois.io/documentation) documents the `https://ipwho.is/` endpoint, standard geolocation, and `connection.isp`, `connection.org` and `connection.asn`. The free CORS endpoint allows 1,000 requests per day per origin, shared across all visitors to that origin; it provides standard accuracy and no SLA. Free responses do not include paid security/VPN flags. The tools therefore do not claim to detect VPNs from IP reputation.
- The geolocation display labels coordinates and place names as estimates. IP databases often locate a network exit/gateway rather than the visitor's physical location.

## DNS

- [Cloudflare DNS-over-HTTPS JSON API](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/) is used for individual DNS lookups, with query name, type, response code, answer data and TTL displayed from the returned response.
- [Google Public DNS JSON API](https://developers.google.com/speed/public-dns/docs/doh/json) is used as a second public recursive resolver for selected comparisons. Comparing two recursive resolvers is a small snapshot, not proof of worldwide DNS propagation or authoritative-zone state.
- Resolver latency is measured with browser `performance.now()` around HTTPS requests and includes the visitor's browser, network and resolver/CDN path. It is not ICMP ping.
- A returned TTL is the resolver response value and may reflect cache age; it is not necessarily the authoritative zone's configured TTL.
- DNS response codes follow [RFC 1035](https://www.rfc-editor.org/rfc/rfc1035): `Status 0` is NOERROR and `Status 3` is Name Error (NXDOMAIN). [RFC 6761](https://www.rfc-editor.org/rfc/rfc6761) says names beneath `.invalid` should return NXDOMAIN. The MX checker treats nonzero DNS status as a failed lookup; a NOERROR response with an empty MX answer remains a successful no-MX result.
- The DNSSEC AD flag is shown as a resolver-provided signal. An unset flag alone does not prove DNSSEC failure; the tools do not independently validate a complete signature chain.
- SPF analysis is deliberately bounded (at most 15 TXT queries and depth 5) and reports a structural estimate, not full SPF evaluation. Macro expansion and some mechanisms remain unresolved.

## VPN and WebRTC

- The user must tick a consent checkbox before the VPN/WebRTC route check. It compares an ipify-observed address with WebRTC ICE candidate signals and contacts the public STUN endpoint `stun.l.google.com:19302`.
- [WebRTC peer-connection guidance](https://webrtc.org/getting-started/peer-connections) documents ICE/STUN candidate gathering and uses the same Google STUN endpoint in its example. [MDN's ICE-candidate address reference](https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidate/address) explains that a candidate address can reveal network information and that privacy controls may limit what is exposed.
- The route check is not a VPN/proxy classifier. A match, mismatch, or missing candidate is only a signal; browser privacy settings, routing and network policy affect the outcome.

## Other measurements and bundled data

- The download-rate sample transfers a fixed, incompressible 256 KiB file from the same site. It is one short HTTPS request, not a full multi-stream broadband speed test; CDN, cache, device and browser conditions affect the estimate.
- Browser network-profile data uses the [MDN Network Information API](https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation), which MDN marks as having limited availability. Values such as `effectiveType`, `downlink` and `rtt` are browser estimates, and unsupported browsers return no result.
- The IP special-use checker uses a short locally bundled list of common IANA IPv4/IPv6 special-purpose ranges. The [IANA registries](https://www.iana.org/assignments/iana-ipv4-special-registry) (last updated 2025-10-09) list `192.0.0.9/32` and `2001:1::1/128` as Port Control Protocol Anycast addresses, RFC 7723; the tool matches these exact prefixes and does not treat the surrounding `192.0.0.0/24` uniformly. Its list is not exhaustive, and a no-match does not prove global reachability.
- The [RFC 7505 Null MX standard](https://www.rfc-editor.org/rfc/rfc7505) defines a sole MX record with preference `0` and exchange `.` as a declaration that the domain does not accept email. A Null MX cannot be combined with ordinary MX targets.

No paid API, paid model, subscription tier or premium-only feature is used by these tools.
