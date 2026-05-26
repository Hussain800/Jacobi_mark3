/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  Jacobi Evasion — Unified Anti-Fingerprint Preload Script          ║
 * ║  Injected via page.evaluateOnNewDocument() BEFORE page load.       ║
 * ║                                                                     ║
 * ║  Modules:                                                           ║
 * ║    §1  Prototype Shadowing Engine (WeakMap toString cloaking)       ║
 * ║    §2  Canvas Spoofing (Mulberry32 PRNG + shadow canvas)           ║
 * ║    §3  WebGL Prototype Spoofing (parameter + shader precision)     ║
 * ║    §4  WebRTC Full Shielding (ES6 Proxy + SDP masking)             ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Runtime contract:
 *   - Injected by Playwright/Puppeteer via evaluateOnNewDocument.
 *   - Receives `__jacobi_config__` on globalThis before execution:
 *       { sessionSeed: number, profile: HardwareProfile }
 *   - All patched methods pass Function.prototype.toString checks.
 *   - Zero DOM side-effects; pure prototype-level overrides.
 */

(() => {
  "use strict";

  // ─── Configuration Gate ────────────────────────────────────────────
  const cfg = globalThis.__jacobi_config__ || {};
  const SEED = cfg.sessionSeed || 0xdeadbeef;
  const PROFILE = cfg.profile || {};
  const WEBGL = PROFILE.webgl || {};

  // ═══════════════════════════════════════════════════════════════════
  // §1  PROTOTYPE SHADOWING ENGINE
  // ═══════════════════════════════════════════════════════════════════
  //
  // WeakMap-backed Function.prototype.toString override.
  // Every method patched via `overrideMethod` is registered here so
  // that calling `.toString()` on it returns the canonical
  // `function <name>() { [native code] }` string, defeating
  // toString-based bot detectors (e.g., FingerprintJS, CreepJS).
  // ───────────────────────────────────────────────────────────────────

  const _nativeStrings = new WeakMap();
  const _origToString = Function.prototype.toString;

  /**
   * Registers a function in the native-string WeakMap.
   * @param {Function} fn   – The replacement function to cloak.
   * @param {string}   name – The original native method name.
   */
  function _registerNative(fn, name) {
    _nativeStrings.set(fn, `function ${name}() { [native code] }`);
  }

  // Patch Function.prototype.toString itself
  const _patchedToString = function toString() {
    // If `this` is in the WeakMap, return the spoofed string
    if (_nativeStrings.has(this)) {
      return _nativeStrings.get(this);
    }
    return _origToString.call(this);
  };

  _registerNative(_patchedToString, "toString");
  Object.defineProperty(Function.prototype, "toString", {
    value: _patchedToString,
    writable: true,
    configurable: true,
  });

  /**
   * Core override helper — patches a prototype-level method or getter
   * and registers the replacement in the native-string WeakMap.
   *
   * @param {Object}   proto     – The prototype to patch (e.g., CanvasRenderingContext2D.prototype).
   * @param {string}   propName  – Property name (e.g., "getImageData").
   * @param {Function} replaceFn – A function receiving the original value/fn and returning the replacement.
   * @param {"method"|"getter"} [kind="method"] – Whether to patch a method or a getter.
   */
  function overrideMethod(proto, propName, replaceFn, kind = "method") {
    const descriptor = Object.getOwnPropertyDescriptor(proto, propName);
    if (!descriptor) return; // Property doesn't exist on this prototype

    if (kind === "getter") {
      const origGetter = descriptor.get;
      if (!origGetter) return;
      const newGetter = replaceFn(origGetter);
      _registerNative(newGetter, propName);
      Object.defineProperty(proto, propName, {
        ...descriptor,
        get: newGetter,
      });
    } else {
      const origMethod = descriptor.value;
      if (typeof origMethod !== "function") return;
      const newMethod = replaceFn(origMethod);
      _registerNative(newMethod, propName);
      Object.defineProperty(proto, propName, {
        ...descriptor,
        value: newMethod,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // §2  CANVAS SPOOFING
  // ═══════════════════════════════════════════════════════════════════
  //
  // Mulberry32 PRNG seeded by session token provides deterministic
  // but unique-per-session noise. We apply spatial micro-noise (±1)
  // to pixel data via a shadow-canvas technique:
  //   1. getImageData  → noise each RGBA channel by ±1
  //   2. toDataURL     → render through noised shadow canvas
  //   3. toBlob        → render through noised shadow canvas
  //
  // The shadow canvas ensures anti-aliasing and composite operations
  // are preserved; only the final readback is perturbed.
  // ───────────────────────────────────────────────────────────────────

  /**
   * Mulberry32 — fast 32-bit PRNG with full-period guarantee.
   * Returns a closure producing floats in [0, 1).
   * @param {number} seed – 32-bit integer seed.
   * @returns {() => number}
   */
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const _prng = mulberry32(SEED);

  /**
   * Applies ±1 micro-noise to an ImageData's pixel buffer.
   * Deterministic per session (same PRNG state), spatially varied.
   * @param {ImageData} imageData
   * @returns {ImageData}
   */
  function _noiseImageData(imageData) {
    const data = imageData.data;
    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      // Skip fully transparent pixels — no visual signal to perturb
      if (data[i + 3] === 0) continue;
      // Apply ±1 noise to R, G, B channels only (preserve alpha)
      for (let c = 0; c < 3; c++) {
        const noise = (_prng() < 0.5 ? -1 : 1);
        const val = data[i + c] + noise;
        data[i + c] = val < 0 ? 0 : val > 255 ? 255 : val;
      }
    }
    return imageData;
  }

  /**
   * Creates a shadow canvas from the source, applies noise, and
   * returns the shadow canvas for readback operations.
   * @param {HTMLCanvasElement} sourceCanvas
   * @returns {HTMLCanvasElement}
   */
  function _createNoisedShadow(sourceCanvas) {
    const shadow = document.createElement("canvas");
    shadow.width = sourceCanvas.width;
    shadow.height = sourceCanvas.height;
    const ctx = shadow.getContext("2d");
    // Draw original content
    ctx.drawImage(sourceCanvas, 0, 0);
    // Read, noise, put back
    const imageData = ctx.getImageData(0, 0, shadow.width, shadow.height);
    _noiseImageData(imageData);
    ctx.putImageData(imageData, 0, 0);
    return shadow;
  }

  // --- getImageData override ---
  overrideMethod(
    CanvasRenderingContext2D.prototype,
    "getImageData",
    (original) =>
      function getImageData(sx, sy, sw, sh, settings) {
        const imageData = original.call(this, sx, sy, sw, sh, settings);
        return _noiseImageData(imageData);
      }
  );

  // --- toDataURL override ---
  overrideMethod(
    HTMLCanvasElement.prototype,
    "toDataURL",
    (original) =>
      function toDataURL(type, quality) {
        const shadow = _createNoisedShadow(this);
        return original.call(shadow, type, quality);
      }
  );

  // --- toBlob override ---
  overrideMethod(
    HTMLCanvasElement.prototype,
    "toBlob",
    (original) =>
      function toBlob(callback, type, quality) {
        const shadow = _createNoisedShadow(this);
        return original.call(shadow, callback, type, quality);
      }
  );

  // ═══════════════════════════════════════════════════════════════════
  // §3  WEBGL PROTOTYPE SPOOFING
  // ═══════════════════════════════════════════════════════════════════
  //
  // Overrides at the PROTOTYPE level (not per-instance) so that any
  // WebGL context created after injection inherits spoofed values.
  //
  // Targets:
  //   - getParameter: VENDOR, RENDERER, UNMASKED_VENDOR, UNMASKED_RENDERER
  //   - getShaderPrecisionFormat: match hardware precision profile
  //
  // Both WebGLRenderingContext and WebGL2RenderingContext are patched.
  // ───────────────────────────────────────────────────────────────────

  // WebGL parameter constants
  const GL_VENDOR            = 0x1F00; // 7936
  const GL_RENDERER          = 0x1F01; // 7937
  const GL_UNMASKED_VENDOR   = 0x9245; // 37445
  const GL_UNMASKED_RENDERER = 0x9246; // 37446

  /**
   * Shader type → precision format lookup key mapping.
   * Used to match profile.webgl.shaderPrecision entries.
   */
  const PRECISION_KEYS = {
    // shaderType 35633 = VERTEX_SHADER
    // shaderType 35632 = FRAGMENT_SHADER
    // precisionType 36336 = HIGH_FLOAT, 36337 = MEDIUM_FLOAT, 36338 = LOW_FLOAT
    // precisionType 36339 = HIGH_INT,   36340 = MEDIUM_INT,   36341 = LOW_INT
    "35633_36336": "vertexHighFloat",
    "35633_36339": "vertexHighInt",
    "35632_36336": "fragmentHighFloat",
    "35632_36339": "fragmentHighInt",
  };

  /**
   * Patches getParameter on a WebGL prototype.
   * @param {Object} proto – WebGLRenderingContext.prototype or WebGL2RenderingContext.prototype
   */
  function _patchWebGLGetParameter(proto) {
    if (!proto) return;

    overrideMethod(proto, "getParameter", (original) =>
      function getParameter(pname) {
        switch (pname) {
          case GL_VENDOR:
            return WEBGL.vendor || original.call(this, pname);
          case GL_RENDERER:
            return WEBGL.renderer || original.call(this, pname);
          case GL_UNMASKED_VENDOR:
            return WEBGL.unmaskedVendor || original.call(this, pname);
          case GL_UNMASKED_RENDERER:
            return WEBGL.unmaskedRenderer || original.call(this, pname);
          default:
            return original.call(this, pname);
        }
      }
    );
  }

  /**
   * Patches getShaderPrecisionFormat on a WebGL prototype.
   * @param {Object} proto – WebGLRenderingContext.prototype or WebGL2RenderingContext.prototype
   */
  function _patchWebGLShaderPrecision(proto) {
    if (!proto) return;

    const shaderPrecision = WEBGL.shaderPrecision;
    if (!shaderPrecision) return;

    overrideMethod(proto, "getShaderPrecisionFormat", (original) =>
      function getShaderPrecisionFormat(shaderType, precisionType) {
        const key = `${shaderType}_${precisionType}`;
        const profileEntry = shaderPrecision[PRECISION_KEYS[key]];

        if (profileEntry) {
          // Construct a WebGLShaderPrecisionFormat-like object.
          // The real return is a host object; we mimic its shape.
          const result = original.call(this, shaderType, precisionType);
          if (result) {
            Object.defineProperties(result, {
              rangeMin:  { value: profileEntry.rangeMin,  writable: false },
              rangeMax:  { value: profileEntry.rangeMax,  writable: false },
              precision: { value: profileEntry.precision, writable: false },
            });
          }
          return result;
        }
        return original.call(this, shaderType, precisionType);
      }
    );
  }

  // Patch both WebGL1 and WebGL2 prototypes
  const webglProtos = [
    typeof WebGLRenderingContext !== "undefined"
      ? WebGLRenderingContext.prototype
      : null,
    typeof WebGL2RenderingContext !== "undefined"
      ? WebGL2RenderingContext.prototype
      : null,
  ].filter(Boolean);

  for (const proto of webglProtos) {
    _patchWebGLGetParameter(proto);
    _patchWebGLShaderPrecision(proto);
  }

  // ═══════════════════════════════════════════════════════════════════
  // §4  WEBRTC FULL SHIELDING
  // ═══════════════════════════════════════════════════════════════════
  //
  // Full WebRTC leak prevention via ES6 Proxy on the RTCPeerConnection
  // constructor. Attack surface:
  //   1. SDP payloads in createOffer / createAnswer (mDNS / IP leak)
  //   2. onicecandidate handler (ICE candidate IP leak)
  //   3. addEventListener("icecandidate", ...) — alternate path
  //   4. localDescription getter — cached SDP readback
  //
  // Strategy: intercept the constructor, return a Proxy that traps
  // property access and method calls. SDP strings are sanitized by
  // replacing RFC-5245 candidate lines containing local/private IPs
  // with mDNS placeholders.
  // ───────────────────────────────────────────────────────────────────

  /**
   * Regex matching ICE candidate lines with private/local IPv4/IPv6.
   * Captures the IP portion for replacement.
   */
  const _privateIPRegex =
    /(\b(?:10|127|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b|::1|fe80:[^\s]*|fd[0-9a-f]{2}:[^\s]*)/gi;

  /**
   * Sanitizes an SDP string by replacing private IPs with an mDNS UUID.
   * @param {string} sdp – Raw SDP string.
   * @returns {string} – Sanitized SDP.
   */
  function _sanitizeSDP(sdp) {
    if (typeof sdp !== "string") return sdp;
    return sdp.replace(_privateIPRegex, "00000000-0000-0000-0000-000000000000.local");
  }

  /**
   * Sanitizes an RTCSessionDescription (or plain object with sdp field).
   * Returns a new object — never mutates the original.
   * @param {RTCSessionDescription|Object} desc
   * @returns {RTCSessionDescription|Object}
   */
  function _sanitizeDescription(desc) {
    if (!desc || typeof desc.sdp !== "string") return desc;
    const sanitized = _sanitizeSDP(desc.sdp);
    // If it's an RTCSessionDescription instance, create a new one
    if (typeof RTCSessionDescription !== "undefined" && desc instanceof RTCSessionDescription) {
      return new RTCSessionDescription({ type: desc.type, sdp: sanitized });
    }
    // Plain object fallback
    return { ...desc, sdp: sanitized };
  }

  /**
   * Sanitizes an RTCIceCandidate, masking private IPs in the
   * candidate string and the address property.
   * @param {RTCIceCandidate} candidate
   * @returns {RTCIceCandidate|null}
   */
  function _sanitizeCandidate(candidate) {
    if (!candidate) return candidate;
    // Replace IPs in the candidate string
    const cleanCandidate = candidate.candidate
      ? _sanitizeSDP(candidate.candidate)
      : candidate.candidate;
    // If the candidate string becomes empty or is only whitespace, suppress it
    if (
      cleanCandidate &&
      cleanCandidate.trim() === ""
    ) {
      return null;
    }
    try {
      return new RTCIceCandidate({
        candidate: cleanCandidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
        usernameFragment: candidate.usernameFragment,
      });
    } catch {
      return candidate;
    }
  }

  // Gate: only patch if RTCPeerConnection exists
  if (typeof RTCPeerConnection !== "undefined") {
    const OriginalRTCPeerConnection = RTCPeerConnection;

    const RTCPeerConnectionProxy = new Proxy(OriginalRTCPeerConnection, {
      construct(target, args, newTarget) {
        const pc = Reflect.construct(target, args, newTarget);

        // Return a Proxy around the instance to intercept property access
        return new Proxy(pc, {
          get(target, prop, receiver) {
            // ─── createOffer / createAnswer ───
            if (prop === "createOffer" || prop === "createAnswer") {
              const origFn = Reflect.get(target, prop, receiver);
              const wrapped = function (...fnArgs) {
                return origFn.apply(target, fnArgs).then((desc) =>
                  _sanitizeDescription(desc)
                );
              };
              _registerNative(wrapped, prop);
              return wrapped;
            }

            // ─── localDescription getter ───
            if (prop === "localDescription") {
              const desc = Reflect.get(target, prop, receiver);
              return _sanitizeDescription(desc);
            }

            // ─── onicecandidate setter interception ───
            if (prop === "onicecandidate") {
              return Reflect.get(target, prop, receiver);
            }

            // ─── addEventListener ───
            if (prop === "addEventListener") {
              const origAdd = Reflect.get(target, prop, receiver);
              const wrapped = function addEventListener(type, listener, options) {
                if (type === "icecandidate" && typeof listener === "function") {
                  const wrappedListener = function (event) {
                    if (event && event.candidate) {
                      const sanitized = _sanitizeCandidate(event.candidate);
                      // Create a synthetic event-like object
                      const syntheticEvent = new Event("icecandidate");
                      Object.defineProperty(syntheticEvent, "candidate", {
                        value: sanitized,
                        writable: false,
                        enumerable: true,
                        configurable: true,
                      });
                      return listener.call(this, syntheticEvent);
                    }
                    return listener.call(this, event);
                  };
                  return origAdd.call(target, type, wrappedListener, options);
                }
                return origAdd.call(target, type, listener, options);
              };
              _registerNative(wrapped, "addEventListener");
              return wrapped;
            }

            // ─── Default passthrough ───
            const value = Reflect.get(target, prop, receiver);
            if (typeof value === "function") {
              return value.bind(target);
            }
            return value;
          },

          set(target, prop, value, receiver) {
            // ─── onicecandidate handler ───
            if (prop === "onicecandidate" && typeof value === "function") {
              const wrappedHandler = function (event) {
                if (event && event.candidate) {
                  const sanitized = _sanitizeCandidate(event.candidate);
                  const syntheticEvent = new Event("icecandidate");
                  Object.defineProperty(syntheticEvent, "candidate", {
                    value: sanitized,
                    writable: false,
                    enumerable: true,
                    configurable: true,
                  });
                  return value.call(target, syntheticEvent);
                }
                return value.call(target, event);
              };
              target.onicecandidate = wrappedHandler;
              return true;
            }
            return Reflect.set(target, prop, value, receiver);
          },
        });
      },

      // Ensure `RTCPeerConnection.prototype` and static properties pass checks
      get(target, prop, receiver) {
        return Reflect.get(target, prop, receiver);
      },
    });

    // Register for toString cloaking
    _registerNative(RTCPeerConnectionProxy, "RTCPeerConnection");

    // Replace the global
    Object.defineProperty(globalThis, "RTCPeerConnection", {
      value: RTCPeerConnectionProxy,
      writable: true,
      configurable: true,
    });

    // Also shadow webkitRTCPeerConnection if it exists (Chromium alias)
    if (typeof globalThis.webkitRTCPeerConnection !== "undefined") {
      Object.defineProperty(globalThis, "webkitRTCPeerConnection", {
        value: RTCPeerConnectionProxy,
        writable: true,
        configurable: true,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // §5  INTEGRITY SEAL
  // ═══════════════════════════════════════════════════════════════════
  // Freeze critical prototypes to prevent post-injection re-patching
  // by adversarial page scripts attempting to detect or undo overrides.
  // ───────────────────────────────────────────────────────────────────

  // Seal our toString override against further tampering
  Object.defineProperty(Function.prototype, "toString", {
    writable: false,
    configurable: false,
  });

  // Clean up config from global scope to avoid detection
  try {
    delete globalThis.__jacobi_config__;
  } catch {
    // In strict mode or frozen globals, silently ignore
  }
})();
