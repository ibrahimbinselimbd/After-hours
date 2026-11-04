(() => {
  'use strict';
  const tools = {};
  const STATUS = {0:'NOERROR',1:'FORMERR',2:'SERVFAIL',3:'NXDOMAIN',4:'NOTIMP',5:'REFUSED',6:'YXDOMAIN',7:'YXRRSET',8:'NXRRSET',9:'NOTAUTH',10:'NOTZONE',11:'DSO-TYPE-I'};
  const TYPE = {A:1,NS:2,CNAME:5,SOA:6,PTR:12,MX:15,TXT:16,AAAA:28,SRV:33,DS:43,RRSIG:46,DNSKEY:48,CAA:257,SVCB:64,HTTPS:65};
  const RESOLVERS = {
    cloudflare:{name:'Cloudflare 1.1.1.1 DNS-over-HTTPS',url:'https://cloudflare-dns.com/dns-query',json:true},
    google:{name:'Google Public DNS',url:'https://dns.google/resolve',json:false},
  };
  const timestamp = () => new Date().toISOString();
  const result = (text, ok = true) => ({text, ok});
  const report = (title, body, source, observed = timestamp()) => result(`${title}\nObserved: ${observed}\nSource: ${source}\n\n${body}`);
  const errorResult = (error, context = 'The check could not be completed') => result(`${context}: ${error?.message || 'no usable response was received'}. No credit was used.`, false);
  const safe = value => String(value ?? '').trim();
  const validateIp = value => {
    const v4 = parseIPv4(value);
    if (v4 !== null) return {version:4,value:v4,text:formatIPv4(v4)};
    const v6 = parseIPv6(value);
    if (v6 !== null) return {version:6,value:v6,text:formatIPv6(v6)};
    throw new Error('Enter a valid IPv4 or IPv6 address.');
  };
  function parseIPv4(value) {
    const parts = String(value ?? '').trim().split('.');
    if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return null;
    return parts.reduce((n,p) => (n << 8n) | BigInt(Number(p)), 0n);
  }
  function formatIPv4(value) {
    const n = BigInt(value);
    return [24n,16n,8n,0n].map(shift => Number((n >> shift) & 255n)).join('.');
  }
  function parseIPv6(value) {
    let text = String(value ?? '').trim().toLowerCase();
    if (!text || text.includes('%') || (text.match(/::/g) || []).length > 1) return null;
    if (text.includes('.')) {
      const pos = text.lastIndexOf(':');
      const v4 = parseIPv4(text.slice(pos + 1));
      if (v4 === null || pos < 0) return null;
      text = `${text.slice(0,pos)}:${((v4 >> 16n) & 0xffffn).toString(16)}:${(v4 & 0xffffn).toString(16)}`;
    }
    const compressed = text.includes('::');
    const [leftText,rightText=''] = compressed ? text.split('::') : [text,''];
    const left = leftText ? leftText.split(':') : [];
    const right = rightText ? rightText.split(':') : [];
    if ([...left,...right].some(group => !/^[0-9a-f]{1,4}$/.test(group))) return null;
    const missing = 8 - left.length - right.length;
    if ((compressed && missing < 1) || (!compressed && missing !== 0)) return null;
    const groups = compressed ? [...left,...Array(missing).fill('0'),...right] : left;
    if (groups.length !== 8) return null;
    return groups.reduce((n,g) => (n << 16n) | BigInt(parseInt(g,16)), 0n);
  }
  function formatIPv6(value, expand = false) {
    const n = BigInt(value);
    const groups = Array.from({length:8},(_,i) => Number((n >> BigInt((7-i)*16)) & 0xffffn).toString(16));
    if (expand) return groups.map(g => g.padStart(4,'0')).join(':');
    let bestStart = -1, bestLength = 1;
    for (let i=0;i<8;) {
      if (groups[i] !== '0') { i++; continue; }
      let j=i; while (j<8 && groups[j] === '0') j++;
      if (j-i > bestLength) { bestStart=i; bestLength=j-i; }
      i=j;
    }
    if (bestStart < 0) return groups.join(':');
    const left = groups.slice(0,bestStart).join(':');
    const right = groups.slice(bestStart+bestLength).join(':');
    return `${left}::${right}`;
  }
  function addressFrom(value, version) {
    const parsed = version === 4 ? parseIPv4(value) : parseIPv6(value);
    if (parsed === null) throw new Error(`Enter a valid IPv${version} address.`);
    return {version,value:parsed,bits:version === 4 ? 32 : 128,text:version === 4 ? formatIPv4(parsed) : formatIPv6(parsed)};
  }
  function parseCidr(value, requiredVersion = 0) {
    const [address,prefixText] = String(value ?? '').trim().split('/');
    const parsed4 = parseIPv4(address);
    const parsed6 = parsed4 === null ? parseIPv6(address) : null;
    const version = parsed4 !== null ? 4 : parsed6 !== null ? 6 : 0;
    if (!version || (requiredVersion && version !== requiredVersion)) throw new Error(`Enter a valid IPv${requiredVersion || '4 or 6'} CIDR block.`);
    const bits = version === 4 ? 32 : 128;
    const prefix = prefixText === undefined ? bits : Number(prefixText);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > bits) throw new Error(`Prefix must be between 0 and ${bits}.`);
    const valueBig = version === 4 ? parsed4 : parsed6;
    const size = 1n << BigInt(bits-prefix);
    const start = (valueBig / size) * size;
    const end = start + size - 1n;
    return {version,bits,prefix,start,end,size,mask:((1n << BigInt(bits))-1n) ^ (size-1n)};
  }
  function netText(net) { return `${net.version === 4 ? formatIPv4(net.start) : formatIPv6(net.start)}/${net.prefix}`; }
  function reverseName(address) {
    const ip = typeof address === 'string' ? validateIp(address) : address;
    if (ip.version === 4) return ip.text.split('.').reverse().join('.') + '.in-addr.arpa';
    return formatIPv6(ip.value,true).replace(/:/g,'').split('').reverse().join('.') + '.ip6.arpa';
  }
  function hostname(value, allowService = false) {
    const input = safe(value).replace(/\.$/,'');
    if (!input || input.length > 253 || /[\s/@?#]/.test(input)) throw new Error('Enter a hostname only, without a URL path, whitespace, port or query string.');
    let ascii = input;
    if (!allowService && /[^\x00-\x7f]/.test(input)) {
      try { ascii = new URL(`https://${input}`).hostname; } catch { throw new Error('The hostname is invalid.'); }
    }
    const labels = ascii.split('.');
    if (!labels.length || labels.some(label => !label || label.length > 63 || !/^[a-z0-9_-]+$/i.test(label))) throw new Error('The hostname contains an invalid DNS label.');
    return ascii.toLowerCase();
  }
  async function fetchJson(url, name, extra = {}) {
    const controller = new AbortController();
    const started = performance.now();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, {method:'GET',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:controller.signal,...extra});
      if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}${response.status === 429 ? ' (rate limit)' : ''}`);
      const data = await response.json();
      return {data,elapsedMs:performance.now()-started,observedAt:timestamp()};
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(`${name} timed out after 10 seconds`);
      if (error instanceof TypeError) throw new Error(`${name} could not be reached from this browser; it may be unavailable, blocked or restricted by CORS`);
      throw error;
    } finally { clearTimeout(timeout); }
  }
  async function queryDns(name, type, resolver = 'cloudflare', dnssec = false) {
    const provider = RESOLVERS[resolver];
    if (!provider) throw new Error('Unknown DNS resolver.');
    const queryName = String(name).replace(/\.$/,'');
    if (!queryName || queryName.length > 253) throw new Error('Enter a valid DNS query name.');
    const url = new URL(provider.url);
    url.searchParams.set('name',queryName);
    url.searchParams.set('type',type);
    if (provider.json) url.searchParams.set('do',dnssec ? 'true' : 'false');
    else if (dnssec) url.searchParams.set('do','1');
    const fetched = await fetchJson(url.href,provider.name,{headers:provider.json ? {Accept:'application/dns-json'} : {Accept:'application/json'}});
    const data = fetched.data;
    if (!data || !Number.isInteger(Number(data.Status))) throw new Error(`${provider.name} returned an unrecognized DNS response.`);
    if (Number(data.Status) === 2 || Number(data.Status) === 5) throw new Error(`${provider.name} reported ${STATUS[Number(data.Status)] || data.Status}; retry later or compare another resolver`);
    return {data,provider:provider.name,elapsedMs:fetched.elapsedMs,observedAt:fetched.observedAt,name:queryName,type:String(type).toUpperCase()};
  }
  const statusName = response => STATUS[Number(response.data.Status)] || `DNS status ${response.data.Status}`;
  const answers = response => Array.isArray(response.data.Answer) ? response.data.Answer : [];
  const answerData = response => answers(response).map(item => String(item.data ?? '')).filter(Boolean);
  const ttlRows = response => answers(response).map(item => `  ${item.name || response.name}  ${item.TTL ?? 'TTL unavailable'}s  ${item.data ?? ''}`);
  function dnsReport(title, response, extra = '') {
    const rows = ttlRows(response);
    const body = [`Query: ${response.name} ${response.type}`, `Response: ${statusName(response)} (${response.data.Status})`, `Resolver: ${response.provider}`, `Resolver round trip: ${response.elapsedMs.toFixed(1)} ms`, `Answers: ${rows.length}`, rows.length ? rows.join('\n') : 'No answer records were returned.', extra].filter(Boolean).join('\n');
    return report(title,body,`${response.provider}; query made directly from this browser`,response.observedAt);
  }
  async function ipify(url, name) {
    const fetched = await fetchJson(`${url}?format=json`,name,{headers:{Accept:'application/json'}});
    const address = validateIp(fetched.data?.ip);
    return {...fetched,address};
  }
  async function ipWho(ipValue = '') {
    const ipPart = safe(ipValue);
    if (ipPart) validateIp(ipPart);
    const url = `https://ipwho.is/${ipPart ? encodeURIComponent(ipPart) : ''}`;
    const fetched = await fetchJson(url,'IPWho.is',{headers:{Accept:'application/json'}});
    if (fetched.data?.success === false) throw new Error(`IPWho.is did not return a lookup: ${fetched.data.message || 'address not accepted'}`);
    return fetched;
  }
  function asnText(data) {
    const connection = data.connection || {};
    return [`IP: ${data.ip || 'not reported'}`,`Address family: ${data.type || 'not reported'}`,`ISP: ${connection.isp || 'not reported'}`,`Organization: ${connection.org || 'not reported'}`,`ASN: ${connection.asn ? `AS${String(connection.asn).replace(/^AS/i,'')}` : 'not reported'}`,`Network domain: ${connection.domain || 'not reported'}`].join('\n');
  }
  function geoText(data) {
    const location = [data.city,data.region,data.country].filter(Boolean).join(', ') || 'Location not reported';
    const timezone = data.timezone?.id || 'not reported';
    const point = Number.isFinite(Number(data.latitude)) && Number.isFinite(Number(data.longitude)) ? `${data.latitude}, ${data.longitude}` : 'not reported';
    return [`IP: ${data.ip || 'not reported'}`,`Approximate IP location: ${location}`,`Coordinates (database estimate): ${point}`,`Time zone: ${timezone}`,`Country code: ${data.country_code || 'not reported'}`].join('\n');
  }
  function dnsStatusExplain(code) {
    const map = {0:'NOERROR — the name exists; the requested record may still be absent.',1:'FORMERR — the DNS server could not parse the query.',2:'SERVFAIL — the resolver failed to complete the query.',3:'NXDOMAIN — the queried name does not exist.',4:'NOTIMP — the server does not implement this operation.',5:'REFUSED — the server refused this query.',6:'YXDOMAIN — a name that should not exist does exist.',7:'YXRRSET — a record set that should not exist does exist.',8:'NXRRSET — the requested record set does not exist.',9:'NOTAUTH — the server is not authoritative for the zone.',10:'NOTZONE — the query refers to a name outside the zone.',11:'DSO-TYPE-I — DNS Stateful Operations response.'};
    return map[Number(code)] || `Unknown or extended response code ${code}; consult the resolver's documentation.`;
  }
  function maskForPrefix(prefix) { return prefix === 0 ? 0n : ((1n << 32n)-1n) ^ ((1n << BigInt(32-prefix))-1n); }
  function ipv4Cidr(value) {
    const net = parseCidr(value,4); const size = net.size;
    const broadcast = net.prefix >= 31 ? 'Not defined for this /31 or /32 block' : formatIPv4(net.end); const count = size.toString();
    const hosts = net.prefix === 32 ? 'Single-address host route; no conventional host range.' : net.prefix === 31 ? 'Both addresses are usable on a point-to-point /31 link; no conventional network/broadcast host range.' : `${formatIPv4(net.start+1n)} – ${formatIPv4(net.end-1n)}`;
    const mask = formatIPv4(maskForPrefix(net.prefix));
    return [`Network: ${formatIPv4(net.start)}/${net.prefix}`,`Subnet mask: ${mask}`,`Broadcast: ${broadcast}`,`Address count: ${count}`,`Conventional host range: ${hosts}`].join('\n');
  }
  function summarizeV4(values) {
    const blocks = String(values).split(/[\s,;]+/).filter(Boolean).map(value => parseCidr(value,4)).map(net => [net.start,net.end]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
    if (!blocks.length) throw new Error('Enter at least one IPv4 CIDR block.');
    const merged=[];
    for (const range of blocks) {
      const last=merged[merged.length-1];
      if (last && range[0] <= last[1]+1n) { if (range[1]>last[1]) last[1]=range[1]; }
      else merged.push([...range]);
    }
    const result=[];
    for (const [start,end] of merged) {
      let current=start;
      while (current<=end) {
        let alignment=0;
        if (current===0n) alignment=32;
        else { let n=current; while ((n&1n)===0n && alignment<32) { alignment++; n>>=1n; } }
        const remaining=end-current+1n;
        let fit=0; while (fit<32 && (1n<<BigInt(fit+1))<=remaining) fit++;
        const exp=Math.min(alignment,fit); const prefix=32-exp;
        result.push(`${formatIPv4(current)}/${prefix}`);
        current += 1n<<BigInt(exp);
      }
    }
    return {inputCount:blocks.length,mergedCount:merged.length,result};
  }
  function ipScope(ipValue) {
    const address=validateIp(ipValue);
    const common4=[['0.0.0.0/8','This network / current-network special use'],['10.0.0.0/8','Private use (RFC 1918)'],['100.64.0.0/10','Shared address space / carrier-grade NAT'],['127.0.0.0/8','Loopback'],['169.254.0.0/16','Link-local'],['172.16.0.0/12','Private use (RFC 1918)'],['192.0.0.9/32','Port Control Protocol Anycast (RFC 7723)'],['192.0.2.0/24','Documentation (TEST-NET-1)'],['192.168.0.0/16','Private use (RFC 1918)'],['198.18.0.0/15','Benchmark testing'],['198.51.100.0/24','Documentation (TEST-NET-2)'],['203.0.113.0/24','Documentation (TEST-NET-3)'],['224.0.0.0/4','Multicast'],['240.0.0.0/4','Reserved'],['255.255.255.255/32','Limited broadcast']];
    const common6=[['::/128','Unspecified'],['::1/128','Loopback'],['::ffff:0:0/96','IPv4-mapped'],['64:ff9b::/96','NAT64 well-known prefix'],['100::/64','Discard-only'],['2001:1::1/128','Port Control Protocol Anycast (RFC 7723)'],['2001:db8::/32','Documentation'],['2002::/16','6to4 transition prefix'],['3fff::/20','Documentation'],['fc00::/7','Unique-local'],['fe80::/10','Link-local unicast'],['ff00::/8','Multicast']];
    const rows=(address.version===4?common4:common6).map(([range,label])=>({range,label,net:parseCidr(range)}));
    const match=rows.find(row=>row.net.version===address.version&&address.value>=row.net.start&&address.value<=row.net.end);
    return [`Address: ${address.text} (IPv${address.version})`,match?`Matched common special-use range: ${match.range} — ${match.label}.`:'No match in the bundled common-range list. This is not proof of global routability or reachability.',`Registry reference: IANA IPv${address.version} Special-Purpose Address Registry; bundled snapshot last updated 2025-10-09.`].join('\n');
  }
  function commonDnsReport(response) {
    const rows=ttlRows(response);
    return [`Query: ${response.name} ${response.type}`,`Response: ${statusName(response)} (${response.data.Status})`,`Authenticated Data (AD): ${response.data.AD === true ? 'true' : response.data.AD === false ? 'false' : 'not supplied'}`,`Resolver: ${response.provider}`,`Answer TTL/data:\n${rows.length?rows.join('\n'):'No answer records.'}`].join('\n');
  }
  const dnsOne = (type, title, transform = null) => async values => {
    try {
      const name=hostname(values.domain);
      const response=await queryDns(name,type,'cloudflare');
      let extra=''; if(transform) extra=transform(response);
      return dnsReport(title,response,extra);
    } catch(error) { return errorResult(error,'DNS lookup failed'); }
  };

  tools['what-is-my-ip']=async()=>{
    const settled=await Promise.allSettled([ipify('https://api.ipify.org','ipify IPv4 endpoint'),ipify('https://api64.ipify.org','ipify IPv4/IPv6 endpoint')]);
    const rows=settled.map((item,index)=>item.status==='fulfilled'?`${index===0?'IPv4-only endpoint':'dual-stack endpoint'}: ${item.value.address.text}`:`${index===0?'IPv4-only endpoint':'dual-stack endpoint'}: unavailable (${item.reason.message})`);
    if(settled.every(item=>item.status==='rejected')) return errorResult(new Error(rows.join('; ')),'Neither public IP endpoint returned an address');
    const observed=settled.filter(item=>item.status==='fulfilled').map(item=>item.value.observedAt).join(' / ');
    return report('Public address observed by ipify',rows.join('\n')+'\n\nThis is the public egress address visible to the endpoint, which may be a VPN, proxy, carrier NAT or gateway address. It does not identify your device’s private LAN address.','ipify public IP endpoints; requests made directly from this browser',observed);
  };
  tools['ipv4-connectivity-check']=async()=>{try{const r=await ipify('https://api4.ipify.org','ipify IPv4-only endpoint');return report('IPv4 endpoint reached',`Observed IPv4 address: ${r.address.text}\nRequest duration: ${r.elapsedMs.toFixed(1)} ms`,'ipify IPv4-only endpoint; direct browser request',r.observedAt);}catch(e){return errorResult(e,'IPv4 reachability was not measured');}};
  tools['ipv6-connectivity-check']=async()=>{try{const r=await ipify('https://api6.ipify.org','ipify IPv6-only endpoint');if(r.address.version!==6)throw new Error('the endpoint returned a non-IPv6 address');return report('IPv6 endpoint reached',`Observed IPv6 address: ${r.address.text}\nRequest duration: ${r.elapsedMs.toFixed(1)} ms`,'ipify IPv6-only endpoint; direct browser request',r.observedAt);}catch(e){return errorResult(e,'IPv6 reachability is inconclusive; the endpoint may be unavailable, blocked, or unreachable over IPv6');}};
  tools['ip-geolocation-lookup']=async values=>{try{const ipValue=safe(values.ip);const r=await ipWho(ipValue);return report('Approximate IP geolocation',geoText(r.data)+'\n\nIP geolocation is a database estimate and may identify an ISP gateway or VPN exit rather than a device location.','IPWho.is free endpoint; direct browser request. Free CORS quota is shared across this site and may be rate-limited.',r.observedAt);}catch(e){return errorResult(e,'IP geolocation lookup failed');}};
  tools['isp-asn-lookup']=async values=>{try{const ipValue=safe(values.ip);const r=await ipWho(ipValue);return report('ISP and ASN data',asnText(r.data)+'\n\nThe provider’s network registration label may differ from your retail ISP or physical location.','IPWho.is free endpoint; direct browser request. Free CORS quota is shared across this site and may be rate-limited.',r.observedAt);}catch(e){return errorResult(e,'ISP/ASN lookup failed');}};
  tools['ip-reverse-dns-lookup']=async values=>{try{const addr=validateIp(values.ip);const name=reverseName(addr);const r=await queryDns(name,'PTR');return dnsReport('Reverse DNS lookup',r,`Reverse query name: ${name}\nPTR answers are set by the address-space operator and may be absent.`);}catch(e){return errorResult(e,'Reverse-DNS lookup failed');}};
  tools['ip-address-validator']=async values=>{try{const addr=validateIp(values.address);return report('Validated IP address',`Address family: IPv${addr.version}\nNormalized form: ${addr.text}\nReverse-DNS name: ${reverseName(addr)}\nProcessing: local only; no address was sent to a service.`,'Browser calculation using the entered value.');}catch(e){return errorResult(e,'Address validation failed');}};
  tools['ipv4-cidr-calculator']=async values=>{try{return report('IPv4 CIDR calculation',ipv4Cidr(values.cidr),'Browser calculation from the entered CIDR block.');}catch(e){return errorResult(e,'CIDR calculation failed');}};
  tools['ipv6-prefix-calculator']=async values=>{try{const n=parseCidr(values.cidr,6);return report('IPv6 prefix calculation',[`Network prefix: ${formatIPv6(n.start)}/${n.prefix}`,`First address: ${formatIPv6(n.start)}`,`Last address: ${formatIPv6(n.end)}`,`Address count: ${n.size.toString()}`,`Prefix length: /${n.prefix}`].join('\n'),'Browser calculation from the entered IPv6 CIDR block.');}catch(e){return errorResult(e,'IPv6 prefix calculation failed');}};
  tools['ipv6-expand-compress']=async values=>{try{const addr=addressFrom(values.address,6);return report('IPv6 address forms',`Compressed: ${formatIPv6(addr.value)}\nExpanded: ${formatIPv6(addr.value,true)}\nReverse-DNS name: ${reverseName(addr)}\nProcessing: local only.`,'Browser IPv6 parser and formatter.');}catch(e){return errorResult(e,'IPv6 formatting failed');}};
  tools['ipv4-subnet-mask-converter']=async values=>{try{const value=safe(values.mask);let prefix;if(/^\/?\d{1,2}$/.test(value)){prefix=Number(value.replace('/',''));if(prefix<0||prefix>32)throw new Error('Enter a prefix from /0 to /32.');}else{const mask=parseIPv4(value);if(mask===null)throw new Error('Enter a dotted IPv4 subnet mask or prefix such as /24.');const inverse=((1n<<32n)-1n)^mask;if((inverse&(inverse+1n))!==0n)throw new Error('The mask bits are not contiguous.');let bits=mask;prefix=0;while(bits){prefix+=Number(bits&1n);bits>>=1n;}}return report('Subnet mask conversion',`CIDR prefix: /${prefix}\nDotted mask: ${formatIPv4(maskForPrefix(prefix))}\nAddresses per block: ${(1n<<BigInt(32-prefix)).toString()}\nProcessing: local only.`,'Browser calculation from the entered mask.');}catch(e){return errorResult(e,'Subnet mask conversion failed');}};
  tools['cidr-range-summarizer']=async values=>{try{const r=summarizeV4(values.ranges);return report('CIDR summary',`Input ranges: ${r.inputCount}\nMerged ranges: ${r.mergedCount}\nSmallest equivalent non-overlapping set:\n${r.result.join('\n')}\nProcessing: local only.`,'Browser calculation from the entered IPv4 ranges.');}catch(e){return errorResult(e,'CIDR summarization failed');}};
  tools['ip-range-overlap-checker']=async values=>{try{const a=parseCidr(values.rangeA),b=parseCidr(values.rangeB);if(a.version!==b.version)throw new Error('Both ranges must use the same address family.');const overlap=a.start<=b.end&&b.start<=a.end;const contains=a.start<=b.start&&a.end>=b.end;const contained=b.start<=a.start&&b.end>=a.end;return report('CIDR overlap result',`First range normalized: ${netText(a)}\nSecond range normalized: ${netText(b)}\nOverlap: ${overlap?'yes':'no'}\n${contains?'First range contains the second.':contained?'Second range contains the first.':overlap?'The ranges partly overlap.':'The ranges are separate.'}\nProcessing: local only.`,'Browser calculation from the two entered CIDR ranges.');}catch(e){return errorResult(e,'Range comparison failed');}};
  tools['ip-list-sorter-deduplicator']=async values=>{try{const entries=safe(values.addresses).split(/[\s,;]+/).filter(Boolean);if(!entries.length)throw new Error('Enter at least one address.');const valid=[],invalid=[];for(const entry of entries){try{valid.push(validateIp(entry));}catch{invalid.push(entry);}}valid.sort((a,b)=>a.version-b.version||(a.value<b.value?-1:a.value>b.value?1:0));const unique=[...new Map(valid.map(item=>[`${item.version}:${item.value}`,item])).values()];return report('IP address list',`Input entries: ${entries.length}\nValid unique addresses: ${unique.length}\nDuplicate valid entries removed: ${valid.length-unique.length}\nNormalized sorted addresses:\n${unique.map(x=>x.text).join('\n')||'(none)'}\nInvalid entries (not discarded silently):\n${invalid.join('\n')||'(none)'}\nProcessing: local only.`,'Browser parsing and sorting of the entered list.');}catch(e){return errorResult(e,'IP list processing failed');}};
  tools['ip-special-use-checker']=async values=>{try{return report('Common special-use range check',ipScope(values.address),'Bundled common-range snapshot based on the IANA IPv4/IPv6 Special-Purpose Address Registries (registry update 2025-10-09).');}catch(e){return errorResult(e,'IP scope check failed');}};
  tools['vpn-webrtc-leak-check']=async values=>{try{if(!values.consent)throw new Error('Confirm the STUN disclosure checkbox before running this check.');const publicIp=await ipify('https://api.ipify.org','ipify IPv4 endpoint');if(typeof RTCPeerConnection==='undefined')return report('VPN/WebRTC route check',`Public IPv4 observed: ${publicIp.address.text}\nThis browser does not expose RTCPeerConnection, so no WebRTC candidate comparison was possible. This cannot establish whether a VPN is active.`,'ipify; WebRTC API availability checked in this browser',publicIp.observedAt);const candidates=await gatherCandidates();const publicCandidates=candidates.filter(c=>c.address&&validateCandidateIp(c.address));const candidateIps=[...new Set(publicCandidates.map(c=>c.address))];const expected=safe(values.expectedIp);if(expected)validateIp(expected);const lines=[`Public IPv4 observed by ipify: ${publicIp.address.text}`,`WebRTC ICE candidates gathered: ${candidates.length}`,`Public candidate addresses: ${candidateIps.join(', ')||'none exposed to this page'}`,`Host candidates: ${candidates.filter(c=>c.type==='host').length}; server-reflexive candidates: ${candidates.filter(c=>c.type==='srflx').length}; relay candidates: ${candidates.filter(c=>c.type==='relay').length}`];if(expected)lines.push(`Expected VPN egress address: ${validateIp(expected).text}`,`Expected-IP comparison: ${candidateIps.includes(validateIp(expected).text)||publicIp.address.text===validateIp(expected).text?'match observed':'no exact match observed'}`);lines.push(candidateIps.includes(publicIp.address.text)?'A server-reflexive candidate matches the public IP endpoint. This does not prove a VPN leak; it only shows the same address to both checks.':candidateIps.length?'A public WebRTC candidate differs from the ipify address. This is a route-mismatch signal, not proof of VPN failure.':'No public WebRTC candidate was visible. Browser privacy controls, network policy or STUN availability may explain this; absence is inconclusive.','The test cannot reliably classify VPN/proxy use. The STUN request reveals the current public address to Google’s public STUN service.');return report('VPN/WebRTC route signals',lines.join('\n'),'ipify plus Google public STUN (stun.l.google.com:19302); direct requests from this browser',publicIp.observedAt);}catch(e){return errorResult(e,'VPN/WebRTC check could not complete');}};
  function validateCandidateIp(address){try{validateIp(address);return true;}catch{return false;}}
  async function gatherCandidates(){return new Promise((resolve,reject)=>{let peer;const found=[];let finished=false;const done=()=>{if(finished)return;finished=true;try{peer?.close();}catch{}resolve(found);};const timer=setTimeout(done,7000);try{peer=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});peer.onicecandidate=event=>{if(event.candidate){const c=event.candidate;const line=c.candidate||'';found.push({type:c.type||line.match(/\btyp\s+(\w+)/)?.[1]||'unknown',address:c.address||line.split(/\s+/)[4]||''});}else{clearTimeout(timer);done();}};peer.createDataChannel('ba-route-check');peer.createOffer().then(offer=>peer.setLocalDescription(offer)).catch(error=>{clearTimeout(timer);try{peer.close();}catch{}reject(new Error(`WebRTC candidate gathering failed: ${error.message}`));});}catch(error){clearTimeout(timer);reject(new Error(`WebRTC setup is unavailable: ${error.message}`));}});}
  tools['browser-network-profile']=async()=>{const n=navigator.connection||navigator.mozConnection||navigator.webkitConnection;if(!n)return result('This browser does not expose the Network Information API. No connection metrics are available here, and no credit was used.',false);const lines=[`Effective connection type: ${n.effectiveType||'not reported'}`,`Estimated downlink: ${Number.isFinite(n.downlink)?`${n.downlink} Mbps`:'not reported'}`,`Estimated round-trip time: ${Number.isFinite(n.rtt)?`${n.rtt} ms`:'not reported'}`,`Data-saver preference: ${typeof n.saveData==='boolean'?String(n.saveData):'not reported'}`,`Connection type: ${n.type||'not exposed'}`,`These are browser estimates, not a measured speed test.`];return report('Browser network profile',lines.join('\n'),'Browser Network Information API; support is limited and varies by browser.');};
  tools['download-speed-sample']=async()=>{try{const url=new URL('/tools/_shared/network-tools/payload-256k.bin',location.origin);url.searchParams.set('sample',String(Date.now()));const started=performance.now();const response=await fetch(url.href,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw new Error(`same-site test file returned HTTP ${response.status}`);const buffer=await response.arrayBuffer();const ms=performance.now()-started;if(!buffer.byteLength)throw new Error('the test file was empty');const mbps=(buffer.byteLength*8)/(ms/1000)/1e6;return report('Single-file download sample',`Bytes received: ${buffer.byteLength.toLocaleString()}\nElapsed time: ${ms.toFixed(1)} ms\nObserved transfer rate: ${mbps.toFixed(2)} Mbps\nThis is one small same-site HTTPS transfer, not a full broadband test; CDN, cache, device and browser conditions affect the result.`,'ByteAfter same-origin 256 KiB test asset; measured in this browser',timestamp());}catch(e){return errorResult(e,'Download speed sample failed');}};
  tools['public-ip-change-tracker']=async()=>{try{const r=await ipify('https://api.ipify.org','ipify IPv4 endpoint');let previous='';try{previous=localStorage.getItem('byteafter:network:last-public-ip')||'';}catch{}let comparison=previous?`Previous address in this browser: ${previous}\nChange detected: ${previous===r.address.text?'no':'yes'}`:'No previous address was stored in this browser yet.';try{localStorage.setItem('byteafter:network:last-public-ip',r.address.text);}catch{comparison+='\nBrowser storage is unavailable, so this value could not be saved for a future comparison.';}return report('Public IP change check',`Current IPv4: ${r.address.text}\n${comparison}\nOnly the most recent comparison value is saved locally in this browser.`,'ipify IPv4 endpoint plus this browser’s localStorage',r.observedAt);}catch(e){return errorResult(e,'Public IP change check failed');}};
  tools['my-dns-resolver-check']=async values=>{try{const name=hostname(values.domain);const type=safe(values.recordType||'A');const [cf,gg]=await Promise.all([queryDns(name,type,'cloudflare'),queryDns(name,type,'google')]);return report('Public DNS resolver comparison',[`Queried name/type: ${name} ${type}`,`Cloudflare 1.1.1.1: ${statusName(cf)}; answers: ${answerData(cf).join(' | ')||'(none)'}`,`Google Public DNS: ${statusName(gg)}; answers: ${answerData(gg).join(' | ')||'(none)'}`,`These are the two public resolvers queried by this page. A browser page cannot read the DNS server configured by your operating system or secure-DNS browser setting.`].join('\n'),'Cloudflare and Google Public DNS-over-HTTPS; direct browser queries',cf.observedAt);}catch(e){return errorResult(e,'Public DNS resolver check failed');}};

  tools['dns-a-record-lookup']=dnsOne('A','DNS A record lookup');
  tools['dns-aaaa-record-lookup']=dnsOne('AAAA','DNS AAAA record lookup');
  tools['dns-mx-record-lookup']=dnsOne('MX','DNS MX record lookup');
  tools['dns-ns-record-lookup']=dnsOne('NS','DNS NS record lookup');
  tools['dns-txt-record-lookup']=dnsOne('TXT','DNS TXT record lookup');
  tools['dns-caa-record-lookup']=dnsOne('CAA','DNS CAA record lookup');
  tools['dns-srv-record-lookup']=async values=>{try{const name=hostname(values.queryName,true);return dnsReport('DNS SRV lookup',await queryDns(name,'SRV'));}catch(e){return errorResult(e,'SRV lookup failed');}};
  tools['dns-soa-record-lookup']=dnsOne('SOA','DNS SOA record lookup');
  tools['dns-https-svcb-lookup']=async values=>{try{const name=hostname(values.domain);const type=safe(values.recordType||'HTTPS');return dnsReport(`DNS ${type} record lookup`,await queryDns(name,type));}catch(e){return errorResult(e,'HTTPS/SVCB lookup failed');}};
  tools['dns-cname-chain-lookup']=async values=>{try{let current=hostname(values.domain);const visited=new Set();const chain=[];let latest;for(let i=0;i<8;i++){if(visited.has(current)){chain.push(`Loop detected at ${current}`);break;}visited.add(current);latest=await queryDns(current,'CNAME');const aliases=answerData(latest).filter(x=>x&&!/^\d/.test(x));if(!aliases.length){chain.push(`${current}: no CNAME answer returned (${statusName(latest)})`);break;}const next=hostname(aliases[0]);chain.push(`${current} → ${next} (TTL ${answers(latest).find(x=>x.data===aliases[0])?.TTL??'unknown'}s)`);current=next;}return report('Observed CNAME chain',chain.join('\n'),'Cloudflare DNS-over-HTTPS; recursive resolver view; maximum 8 hops',latest?.observedAt);}catch(e){return errorResult(e,'CNAME chain lookup failed');}};
  tools['dns-spf-record-finder']=async values=>{try{const name=hostname(values.domain);const r=await queryDns(name,'TXT');const spf=answerData(r).filter(x=>/^\s*"?v=spf1\b/i.test(x));return dnsReport('SPF record discovery',r,`SPF records found: ${spf.length}\n${spf.join('\n')||'No v=spf1 TXT answer was returned. This does not test message delivery.'}`);}catch(e){return errorResult(e,'SPF lookup failed');}};
  tools['dns-dmarc-policy-checker']=async values=>{try{const name=`_dmarc.${hostname(values.domain)}`;const r=await queryDns(name,'TXT');const records=answerData(r).filter(x=>/v=DMARC1/i.test(x));const parsed=records.map(record=>{const tags=Object.fromEntries(record.replace(/"/g,'').split(';').map(part=>part.trim()).filter(Boolean).map(part=>{const pos=part.indexOf('=');return pos<0?[part,'']:[part.slice(0,pos).trim().toLowerCase(),part.slice(pos+1).trim()];}));return `Record: ${record}\nPolicy p=${tags.p||'not set'}, subdomain sp=${tags.sp||'not set'}, percentage pct=${tags.pct||'100/default'}`;});return dnsReport('DMARC policy lookup',r,`DMARC records found: ${records.length}\n${parsed.join('\n\n')||'No v=DMARC1 record was returned at this name.'}`);}catch(e){return errorResult(e,'DMARC lookup failed');}};
  tools['dns-dkim-selector-lookup']=async values=>{try{const name=`${hostname(values.selector,true)}._domainkey.${hostname(values.domain)}`;const r=await queryDns(name,'TXT');return dnsReport('DKIM selector lookup',r,`Selector query name: ${name}\nThe returned TXT data is the observed key record; this page does not verify signatures on email.`);}catch(e){return errorResult(e,'DKIM lookup failed');}};
  tools['dns-ttl-inspector']=async values=>{try{const name=hostname(values.domain);const type=safe(values.recordType||'A');const r=await queryDns(name,type);const ttls=answers(r).map(a=>Number(a.TTL)).filter(Number.isFinite);return dnsReport('Resolver-returned DNS TTL values',r,`TTL values in this response: ${ttls.length?ttls.map(x=>`${x} seconds`).join(', '):'none'}\nA recursive resolver may return a reduced cache TTL; it may differ from the authoritative server’s configured TTL.`);}catch(e){return errorResult(e,'TTL inspection failed');}};
  tools['dnssec-validation-check']=async values=>{try{const name=hostname(values.domain);const type=safe(values.recordType||'A');const r=await queryDns(name,type,'cloudflare',true);const flag=r.data.AD===true?'AD=true: the resolver reports the returned data as DNSSEC-authenticated.':r.data.AD===false?'AD=false: authentication was not reported for this answer; it may be unsigned or not validated. This alone is not proof of a validation failure.':'The resolver did not include an AD flag.';return dnsReport('DNSSEC validation signal',r,`${flag}\nResolver comment: ${r.data.Comment||'none supplied'}`);}catch(e){return errorResult(e,'DNSSEC validation check failed');}};
  tools['dns-response-code-decoder']=async values=>{const code=Number(values.status);return report('DNS response code',`Code: ${Number.isInteger(code)?code:'invalid'}\nMeaning: ${dnsStatusExplain(code)}\nProcessing: local reference; no DNS query was sent.`,'Standard DNS response-code reference in the browser.');};
  tools['dns-propagation-comparison']=async values=>{try{const name=hostname(values.domain);const type=safe(values.recordType||'A');const [cf,gg]=await Promise.all([queryDns(name,type,'cloudflare'),queryDns(name,type,'google')]);const left=[...answerData(cf)].sort();const right=[...answerData(gg)].sort();return report('Two-resolver DNS propagation sample',[`Query: ${name} ${type}`,`Cloudflare: ${statusName(cf)} — ${left.join(' | ')||'(no answers)'}`,`Google: ${statusName(gg)} — ${right.join(' | ')||'(no answers)'}`,`Answer sets match: ${JSON.stringify(left)===JSON.stringify(right)?'yes':'no'}`,`This is a snapshot from two public recursive resolvers at this time. It does not query every authoritative server or establish worldwide propagation.`].join('\n'),'Cloudflare and Google Public DNS-over-HTTPS; direct browser queries',cf.observedAt);}catch(e){return errorResult(e,'DNS resolver comparison failed');}};
  tools['dns-resolver-latency-check']=async values=>{try{const name=hostname(values.domain);const type=safe(values.recordType||'A');const [cf,gg]=await Promise.all([queryDns(name,type,'cloudflare'),queryDns(name,type,'google')]);return report('DNS-over-HTTPS round-trip comparison',[`Query: ${name} ${type}`,`Cloudflare response: ${cf.elapsedMs.toFixed(1)} ms (${statusName(cf)})`,`Google response: ${gg.elapsedMs.toFixed(1)} ms (${statusName(gg)})`,`These browser-observed HTTPS request times include the user’s network, browser and resolver/CDN path. They are not ICMP ping or a universal resolver speed ranking.`].join('\n'),'Cloudflare and Google Public DNS-over-HTTPS; measured with browser performance.now()',cf.observedAt);}catch(e){return errorResult(e,'DNS latency comparison failed');}};
  tools['dns-answer-consistency-check']=async values=>{try{const name=hostname(values.domain);const type=safe(values.recordType||'A');const [cf,gg]=await Promise.all([queryDns(name,type,'cloudflare',true),queryDns(name,type,'google',true)]);const a=[...answerData(cf)].sort(),b=[...answerData(gg)].sort();return report('DNS resolver answer consistency',[`Query: ${name} ${type}`,`Cloudflare: ${statusName(cf)}; AD=${cf.data.AD??'not supplied'}; ${a.join(' | ')||'(no answers)'}`,`Google: ${statusName(gg)}; AD=${gg.data.AD??'not supplied'}; ${b.join(' | ')||'(no answers)'}`,`Answer data identical: ${JSON.stringify(a)===JSON.stringify(b)?'yes':'no'}`,`Differences can reflect resolver cache timing, policy, DNSSEC handling or network conditions; this comparison is not an authoritative-zone audit.`].join('\n'),'Cloudflare and Google Public DNS-over-HTTPS with DNSSEC data requested',cf.observedAt);}catch(e){return errorResult(e,'DNS consistency check failed');}};
  tools['dns-record-snapshot']=async values=>{try{const name=hostname(values.domain);const types=['A','AAAA','MX','NS','TXT'];const snapshots=await Promise.all(types.map(type=>queryDns(name,type)));return report('Compact DNS record snapshot',snapshots.map(item=>`${item.type}: ${statusName(item)}\n${ttlRows(item).join('\n')||'  (no answers)'}`).join('\n\n'),'Cloudflare DNS-over-HTTPS; five record queries made directly from this browser',snapshots[0].observedAt);}catch(e){return errorResult(e,'DNS record snapshot failed');}};
  tools['email-authentication-dns-audit']=async values=>{try{const name=hostname(values.domain);const selector=safe(values.selector);const queries=[queryDns(name,'TXT'),queryDns(`_dmarc.${name}`,'TXT')];if(selector)queries.push(queryDns(`${hostname(selector,true)}._domainkey.${name}`,'TXT'));const found=await Promise.all(queries);const spf=answerData(found[0]).filter(x=>/^\s*"?v=spf1\b/i.test(x));const dmarc=answerData(found[1]).filter(x=>/v=DMARC1/i.test(x));const dkim=found[2]?answerData(found[2]).filter(x=>/\bp=|\bv=DKIM1/i.test(x)):[];return report('Email-authentication DNS snapshot',[`Domain: ${name}`,`SPF record candidates: ${spf.length}\n${spf.join('\n')||'(none returned)'}`,`DMARC record candidates: ${dmarc.length}\n${dmarc.join('\n')||'(none returned)'}`,selector?`DKIM selector ${selector}: ${dkim.length} matching TXT answer(s)\n${dkim.join('\n')||'(none returned)'}`:'DKIM was not queried because no selector was entered.',`This is a DNS snapshot only. It does not verify mail headers, signature validation, alignment or inbox delivery.`].join('\n\n'),'Cloudflare DNS-over-HTTPS; direct browser requests',found[0].observedAt);}catch(e){return errorResult(e,'Email-authentication DNS audit failed');}};
  tools['spf-lookup-budget-analyzer']=async values=>{try{const root=hostname(values.domain);const queue=[{name:root,depth:0}];const visited=new Set();const records=[];let queries=0,mechanisms=0,cutoff=false;while(queue.length&&queries<15){const item=queue.shift();if(visited.has(item.name)||item.depth>5)continue;visited.add(item.name);const r=await queryDns(item.name,'TXT');queries++;const spf=answerData(r).find(x=>/^\s*"?v=spf1\b/i.test(x));if(!spf)continue;const cleaned=spf.replace(/^"|"$/g,'');records.push(`${item.name}: ${cleaned}`);for(const token of cleaned.split(/\s+/).slice(1)){const lower=token.toLowerCase();if(/^include:/i.test(token)){mechanisms++;const target=token.slice(token.indexOf(':')+1);if(target&&!target.includes('%'))queue.push({name:hostname(target),depth:item.depth+1});}else if(/^redirect=/i.test(token)){mechanisms++;const target=token.slice(token.indexOf('=')+1);if(target&&!target.includes('%'))queue.push({name:hostname(target),depth:item.depth+1});}else if(/^(?:a|mx|ptr|exists:)/i.test(token)){mechanisms++;}}}if(queue.length)cutoff=true;return report('SPF DNS-lookup budget estimate',[`Root domain: ${root}`,`Records inspected: ${records.length}`,`Explicit DNS-causing terms observed: at least ${mechanisms}`,`DNS TXT queries made: ${queries} (maximum 15; traversal depth maximum 5)`,`Observed SPF records:\n${records.join('\n')||'(no SPF record was found)'}`,`This is a bounded structural estimate, not full SPF evaluation. Macros, modifiers, mechanism semantics and remote policy may change the real evaluation path.${cutoff?' Safe traversal cap reached; remaining references were not queried.':''}`].join('\n\n'),'Cloudflare DNS-over-HTTPS; bounded recursive TXT lookups',timestamp());}catch(e){return errorResult(e,'SPF budget analysis failed');}};
  tools['mx-priority-target-checker']=async values=>{try{
    const name=hostname(values.domain);
    const mx=await queryDns(name,'MX');
    if(Number(mx.data.Status)!==0){
      const status=Number(mx.data.Status);
      const detail=status===3?'NXDOMAIN (DNS status 3); the queried domain does not exist':`DNS status ${mx.data.Status} (${statusName(mx)}); the resolver did not return NOERROR`;
      return errorResult(new Error(detail),'MX lookup failed');
    }
    const records=answers(mx).map(item=>{
      const match=String(item.data||'').trim().match(/^(\d+)\s+(\S+)$/);
      if(!match)return null;
      const priority=Number(match[1]);
      const exchange=match[2].toLowerCase();
      return exchange==='.'?{priority,host:'',nullMx:true}:{priority,host:exchange.replace(/\.$/,'')};
    }).filter(Boolean).sort((a,b)=>a.priority-b.priority);
    const nullMx=records.filter(record=>record.nullMx);
    if(nullMx.length){
      if(records.length!==1||nullMx[0].priority!==0)return errorResult(new Error('A Null MX must be the only MX record and have preference 0 (RFC 7505).'),'MX record set is invalid');
      return report('MX record and email acceptance',[`Domain: ${name}`,`DNS response: ${statusName(mx)} (status ${mx.data.Status})`,'MX records: 1','Null MX: 0 .','Email acceptance: This domain does not accept email (Null MX; RFC 7505).','No MX target address lookups were performed for this no-service record.'].join('\n'),`${mx.provider}; MX lookup made directly from this browser; Null MX semantics per RFC 7505`,mx.observedAt);
    }
    const lines=[];
    for(const rec of records.slice(0,8)){
      const [a,aaaa]=await Promise.all([queryDns(rec.host,'A'),queryDns(rec.host,'AAAA')]);
      lines.push(`Priority ${rec.priority} — ${rec.host}\n  A: ${answerData(a).join(', ')||'(none returned)'}\n  AAAA: ${answerData(aaaa).join(', ')||'(none returned)'}`);
    }
    return report('MX priority and target addresses',[`Domain: ${name}`,`DNS response: ${statusName(mx)} (status ${mx.data.Status})`,`MX records: ${records.length}`,lines.join('\n')||'No MX records were returned.',`Address lookups do not test SMTP ports, TLS, mailbox acceptance or mail delivery.`].join('\n\n'),'Cloudflare DNS-over-HTTPS; MX plus target A/AAAA queries',mx.observedAt);
  }catch(e){return errorResult(e,'MX target inspection failed');}};
  tools['caa-issuance-policy-checker']=async values=>{try{const name=hostname(values.domain);const r=await queryDns(name,'CAA');const rows=answerData(r);const notes=rows.map(text=>{const m=text.match(/^(\d+)\s+(issuewild|issue|iodef)\s+(.+)$/i);return m?`${m[2]}: ${m[3]} (flags ${m[1]})`:text;});return dnsReport('CAA issuance policy interpretation',r,`Observed CAA directives:\n${notes.join('\n')||'(no CAA answer returned; absence is not a certificate-authority guarantee)'}\nInterpretation is based only on returned DNS text; certificate-authority behavior and inherited parent records are not fully evaluated here.`);}catch(e){return errorResult(e,'CAA policy check failed');}};
  tools['dnssec-record-inspector']=async values=>{try{const name=hostname(values.domain);const type=safe(values.recordType||'DS');const r=await queryDns(name,type,'cloudflare',true);return dnsReport('DNSSEC record inspection',r,`DNSSEC OK (DO) requested: yes\nAuthenticated Data (AD): ${r.data.AD??'not supplied'}\nThe displayed records are resolver output; this page does not independently verify a signature chain.`);}catch(e){return errorResult(e,'DNSSEC record inspection failed');}};
  tools['dns-wildcard-probe']=async values=>{try{const parent=hostname(values.domain);const bytes=new Uint8Array(6);crypto.getRandomValues(bytes);const token=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');const probe=`ba-${token}.${parent}`;const [random,a]=await Promise.all([queryDns(probe,'A'),queryDns(parent,'A')]);const hits=answerData(random);const parentAnswers=answerData(a);return report('One-time wildcard DNS signal',[`Parent: ${parent} → ${parentAnswers.join(', ')||'(no A answer)'}`,`Generated query: ${probe}`,`Generated-label A answer: ${hits.join(', ')||'(no A answer)'}`,`Potential wildcard/catch-all signal: ${hits.length?'yes — the random label resolved':'not observed'}`,`A single recursive lookup can be affected by policy, rewrite rules or caching; it is not proof of the authoritative zone configuration.`].join('\n'),'Cloudflare DNS-over-HTTPS; random label created in this browser',random.observedAt);}catch(e){return errorResult(e,'Wildcard probe failed');}};
  tools['dns-record-type-explorer']=async values=>{try{const name=hostname(values.domain);const type=safe(values.recordType||'A');return dnsReport('DNS record-type explorer',await queryDns(name,type));}catch(e){return errorResult(e,'DNS record query failed');}};
  tools['doh-query-url-builder']=async values=>{try{const name=hostname(values.domain);const type=safe(values.recordType||'A');const resolver=values.resolver==='Google Public DNS'?'google':'cloudflare';const p=RESOLVERS[resolver];const url=new URL(p.url);url.searchParams.set('name',name);url.searchParams.set('type',type);if(resolver==='cloudflare')url.searchParams.set('do','false');return report('DNS-over-HTTPS GET URL',`Resolver: ${p.name}\nRequest URL:\n${url.href}\nThis only builds a URL in this browser; it does not send the query. The resolver receives the query if you later open or request it.`,'Browser URL encoder; no network request was made.');}catch(e){return errorResult(e,'DoH URL construction failed');}};
  tools['hostname-idn-converter']=async values=>{try{const original=safe(values.hostname);const parsed=new URL(`https://${original}`);if(parsed.pathname!=='/'||parsed.search||parsed.hash||parsed.username||parsed.password)throw new Error('Enter a hostname only, without a path, credentials, query or fragment.');const ascii=parsed.hostname.toLowerCase();if(ascii.length>253||ascii.split('.').some(x=>!x||x.length>63))throw new Error('The hostname exceeds DNS length limits.');return report('Hostname and IDN conversion',`Input: ${original}\nASCII/Punycode: ${ascii}\nURL-parser display hostname: ${new URL(`https://${ascii}`).hostname}\nProcessing: local browser URL parser; no DNS query was sent.`,'Browser URL parser/IDNA processing.');}catch(e){return errorResult(e,'Hostname conversion failed');}};
  tools['doh-json-response-inspector']=async values=>{try{const parsed=JSON.parse(values.json);if(!parsed||typeof parsed!=='object'||!Number.isInteger(Number(parsed.Status)))throw new Error('The JSON is missing a numeric DNS Status field.');const questions=Array.isArray(parsed.Question)?parsed.Question.map(q=>`  ${q.name||'?'} type ${q.type??'?'}`):[];const answerRows=Array.isArray(parsed.Answer)?parsed.Answer.map(a=>`  ${a.name||'?'} type ${a.type??'?'} TTL ${a.TTL??'?'}s — ${a.data??''}`):[];return report('DoH JSON response summary',[`DNS status: ${dnsStatusExplain(parsed.Status)}`,`Authenticated Data (AD): ${parsed.AD??'not supplied'}`,`Questions:\n${questions.join('\n')||'  (none)'}`,`Answers:\n${answerRows.join('\n')||'  (none)'}`,`Processing: pasted JSON was parsed locally; no request was made.`].join('\n\n'),'User-provided JSON; processed locally.');}catch(e){return errorResult(e,'DNS JSON inspection failed');}};

  window.AHNetworkTools = tools;
})();
