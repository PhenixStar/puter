/*
 * Copyright (C) 2024-present Puter Technologies Inc.
 *
 * This file is part of Puter.
 *
 * Puter is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
const BaseService = require('../BaseService');

/**
* Represents the OTP (One-Time Password) service.
* This class provides functionalities to create OTP secrets, recovery codes,
* and verify OTPs against given secrets and codes, using the 'otpauth' and 'crypto' libraries.
*/
const TOTP_WINDOW_MS = 90 * 1000; // 3 x 30s windows

class OTPService extends BaseService {
    static MODULES = {
        otpauth: require('otpauth'),
        crypto: require('crypto'),
        ['hi-base32']: require('hi-base32'),
    };

    _construct () {
        // In-memory map for TOTP replay prevention.
        // Key: "<user_id>:<delta>", Value: timestamp of use.
        this._used_totp_codes = new Map();
    }

    create_secret (label) {
        const require = this.require;
        const otpauth = require('otpauth');

        const secret = this.gen_otp_secret_();
        const totp = new otpauth.TOTP({
            issuer: 'puter.com',
            label,
            algorithm: 'SHA1',
            digits: 6,
            secret,
        });

        return {
            url: totp.toString(),
            secret,
        };
    }

    /**
    * Creates a recovery code for the user.
    * Generates a random byte sequence, encodes it in base32,
    * and returns a unique 8-character recovery code.
    *
    * @returns {string} The generated recovery code.
    */
    create_recovery_code () {
        const require = this.require;
        const crypto = require('crypto');
        const { encode } = require('hi-base32');

        const buffer = crypto.randomBytes(6);
        const code = encode(buffer).replace(/=/g, '').substring(0, 8);
        return code;
    }

    verify (label, secret, code, { user_id } = {}) {
        const require = this.require;
        const otpauth = require('otpauth');

        const totp = new otpauth.TOTP({
            issuer: 'puter.com',
            label,
            algorithm: 'SHA1',
            digits: 6,
            secret,
        });

        const allowed = [-1, 0, 1];

        const delta = totp.validate({ token: code });
        if ( delta === null ) return false;
        if ( ! allowed.includes(delta) ) return false;

        // TOTP replay prevention (RFC 6238 Section 5.2)
        if ( user_id ) {
            const replay_key = `${user_id}:${delta}`;
            const now = Date.now();
            const last_used = this._used_totp_codes.get(replay_key);
            if ( last_used && (now - last_used) < TOTP_WINDOW_MS ) {
                return false;
            }
            this._used_totp_codes.set(replay_key, now);
            this._cleanup_used_codes();
        }

        return true;
    }

    /**
     * Removes expired entries from the TOTP replay prevention map.
     */
    _cleanup_used_codes () {
        const now = Date.now();
        for ( const [key, timestamp] of this._used_totp_codes ) {
            if ( now - timestamp > TOTP_WINDOW_MS ) {
                this._used_totp_codes.delete(key);
            }
        }
    }

    /**
    * Generates a random OTP secret.
    * This method creates a 15-byte random buffer and encodes it into a base32 string.
    * The resulting string is trimmed to a maximum length of 24 characters.
    *
    * @returns {string} The generated OTP secret in base32 format.
    */
    gen_otp_secret_ () {
        const require = this.require;
        const crypto = require('crypto');
        const { encode } = require('hi-base32');

        const buffer = crypto.randomBytes(15);
        const base32 = encode(buffer).replace(/=/g, '').substring(0, 24);
        return base32;
    };
};

module.exports = { OTPService };
