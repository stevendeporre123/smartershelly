function ipToNumber(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0);
}

function numberToIp(number) {
  return [
    (number >> 24) & 255,
    (number >> 16) & 255,
    (number >> 8) & 255,
    number & 255
  ].join('.');
}

function expandCidrRange(cidr) {
  if (!cidr) {
    return [];
  }
  const [baseIp, prefixLength] = cidr.split('/');
  const prefix = Number(prefixLength);
  if (!isValidIp(baseIp) || Number.isNaN(prefix) || prefix < 0 || prefix > 32) {
    throw new Error(`Ongeldig CIDR bereik: ${cidr}`);
  }

  const base = ipToNumber(baseIp);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const network = base & mask;
  const hostBits = 32 - prefix;
  const totalHosts = hostBits === 0 ? 1 : 2 ** hostBits;
  const ips = [];
  for (let i = 0; i < totalHosts; i += 1) {
    const ip = network + i;
    const ipString = numberToIp(ip >>> 0);
    ips.push(ipString);
  }
  return ips;
}

function expandTargets({ subnet, ipList }) {
  const targets = new Set();
  if (subnet) {
    const subnetIps = expandCidrRange(subnet);
    const usableIps =
      subnetIps.length > 2 ? subnetIps.slice(1, subnetIps.length - 1) : subnetIps;
    usableIps.forEach((ip) => {
      if (isValidIp(ip)) {
        targets.add(ip);
      }
    });
  }
  if (Array.isArray(ipList)) {
    ipList.forEach((ip) => {
      if (isValidIp(ip)) {
        targets.add(ip);
      }
    });
  }
  return [...targets];
}

function isValidIp(ip) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
}

module.exports = {
  expandCidrRange,
  expandTargets,
  isValidIp
};
