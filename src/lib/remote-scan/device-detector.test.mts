import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { maskIpAddress, parseDeviceMetadata } from "./device-detector.ts";

describe("device-detector", () => {
  it("parses iPhone Safari user agent", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
    const info = parseDeviceMetadata(ua, "82.165.20.12", 1000);

    assert.equal(info.deviceFamily, "iPhone");
    assert.equal(info.browser, "Safari");
    assert.equal(info.os, "iOS 18.1");
    assert.equal(info.displayName, "iPhone · Safari");
    assert.equal(info.ipAddress, "82.xxx.xxx.xxx");
    assert.equal(info.connectedAt, 1000);
  });

  it("parses Android Chrome user agent", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
    const info = parseDeviceMetadata(ua, "192.168.1.50", 2000);

    assert.equal(info.deviceFamily, "Android");
    assert.equal(info.browser, "Chrome");
    assert.equal(info.os, "Android 15");
    assert.equal(info.displayName, "Android · Chrome");
    assert.equal(info.ipAddress, "192.xxx.xxx.xxx");
  });

  it("masks IPs safely", () => {
    assert.equal(maskIpAddress("82.165.20.12"), "82.xxx.xxx.xxx");
    assert.equal(maskIpAddress("82.165.20.12, 10.0.0.1"), "82.xxx.xxx.xxx");
    assert.equal(maskIpAddress("2001:0db8:85a3:0000:0000:8a2e:0370:7334"), "2001:xxxx:xxxx:xxxx");
    assert.equal(maskIpAddress(""), "Unknown");
    assert.equal(maskIpAddress(undefined), "Unknown");
  });

  it("gracefully handles unknown user agent", () => {
    const info = parseDeviceMetadata("SomeRandomBot/1.0", null, 3000);
    assert.equal(info.deviceFamily, "Unknown");
    assert.equal(info.browser, "Browser");
    assert.equal(info.displayName, "Browser");
    assert.equal(info.ipAddress, "Unknown");
  });
});
