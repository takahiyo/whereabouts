/**
 * qrcode-generator v1.4.4
 * (c) 2009 Kazuhiko Arase (MIT License)
 * https://github.com/kazuhikoarase/qrcode-generator
 */
const qrcode = function() {
    var _typeNumber = 0;
    var _errorCorrectionLevel = 'L';
    var _modules = null;
    var _moduleCount = 0;
    var _dataList = [];
    var _qr = {};

    var PAD0 = 0xEC;
    var PAD1 = 0x11;

    _qr.getTypeNumber = function() { return _typeNumber; };
    _qr.setTypeNumber = function(typeNumber) { _typeNumber = typeNumber; };
    _qr.getErrorCorrectionLevel = function() { return _errorCorrectionLevel; };
    _qr.setErrorCorrectionLevel = function(errorCorrectionLevel) { _errorCorrectionLevel = errorCorrectionLevel; };
    _qr.addData = function(data) { _dataList.push(qr8BitByte(data)); _modules = null; };
    _qr.isDark = function(row, col) {
        if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) { throw new Error(row + "," + col); }
        return _modules[row][col];
    };
    _qr.getModuleCount = function() { return _moduleCount; };
    _qr.make = function() {
        if (_typeNumber < 1) {
            var typeNumber = 1;
            var maxTypeNumber = Math.floor(qrRSBlock.RS_BLOCK_TABLE.length / 4);
            for (typeNumber = 1; typeNumber <= maxTypeNumber; typeNumber++) {
                var rsBlocks = qrRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);
                var buffer = qrBitBuffer();
                var totalDataCount = 0;
                for (var i = 0; i < rsBlocks.length; i++) { totalDataCount += rsBlocks[i].dataCount; }
                for (var i = 0; i < _dataList.length; i++) {
                    var data = _dataList[i];
                    buffer.put(data.mode, 4);
                    buffer.put(data.getLength(), qrUtil.getLengthInBits(data.mode, typeNumber) );
                    data.write(buffer);
                }
                if (buffer.getLengthInBits() <= totalDataCount * 8) break;
            }
            if (typeNumber > maxTypeNumber) {
                throw new Error("data too large for available QR versions (max " + maxTypeNumber + ")");
            }
            _typeNumber = typeNumber;
        }
        makeImpl(false, getBestMaskPattern() );
    };

    _qr.createImgTag = function(cellSize, margin) {
        cellSize = cellSize || 2;
        margin = (typeof margin == 'undefined') ? cellSize * 4 : margin;
        var size = _moduleCount * cellSize + margin * 2;
        var min = margin;
        var max = size - margin;
        return qrUtil.createImgTag(size, size, function(x, y) {
            if (min <= x && x < max && min <= y && y < max) {
                var col = Math.floor((x - min) / cellSize);
                var row = Math.floor((y - min) / cellSize);
                if (_qr.isDark(row, col)) return 0;
            }
            return 1;
        });
    };

    _qr.createSvgTag = function(cellSize, margin) {
        cellSize = cellSize || 2;
        margin = (typeof margin == 'undefined') ? cellSize * 4 : margin;
        var size = _moduleCount * cellSize + margin * 2;
        var c = '<svg xmlns="http://www.w3.org/2000/svg"';
        c += ' width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">';
        c += '<rect width="100%" height="100%" fill="#ffffff" />';
        for (var r = 0; r < _moduleCount; r++) {
            for (var col = 0; col < _moduleCount; col++) {
                if (_qr.isDark(r, col)) {
                    c += '<rect x="' + (col * cellSize + margin) + '" y="' + (r * cellSize + margin) + '" width="' + cellSize + '" height="' + cellSize + '" fill="#000000" />';
                }
            }
        }
        c += '</svg>';
        return c;
    };

    var makeImpl = function(test, maskPattern) {
        _moduleCount = _typeNumber * 4 + 17;
        _modules = new Array(_moduleCount);
        for (var row = 0; row < _moduleCount; row++) {
            _modules[row] = new Array(_moduleCount);
            for (var col = 0; col < _moduleCount; col++) { _modules[row][col] = null; }
        }
        setupPositionProbePattern(0, 0);
        setupPositionProbePattern(_moduleCount - 7, 0);
        setupPositionProbePattern(0, _moduleCount - 7);
        setupPositionAdjustPattern();
        setupTimingPattern();
        setupTypeInfo(test, maskPattern);
        if (_typeNumber >= 7) { setupTypeNumber(test); }
        var data = createData(_typeNumber, _errorCorrectionLevel, _dataList);
        mapData(data, maskPattern);
    };

    var setupPositionProbePattern = function(row, col) {
        for (var r = -1; r <= 7; r++) {
            if (row + r <= -1 || _moduleCount <= row + r) continue;
            for (var c = -1; c <= 7; c++) {
                if (col + c <= -1 || _moduleCount <= col + c) continue;
                if ( (0 <= r && r <= 6 && (c == 0 || c == 6) ) || (0 <= c && c <= 6 && (r == 0 || r == 6) ) || (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
                    _modules[row + r][col + c] = true;
                } else {
                    _modules[row + r][col + c] = false;
                }
            }
        }
    };

    var getBestMaskPattern = function() {
        var minLostPoint = 0;
        var pattern = 0;
        for (var i = 0; i < 8; i++) {
            makeImpl(true, i);
            var lostPoint = qrUtil.getLostPoint(_qr);
            if (i == 0 || minLostPoint > lostPoint) {
                minLostPoint = lostPoint;
                pattern = i;
            }
        }
        return pattern;
    };

    var setupPositionAdjustPattern = function() {
        var pos = qrUtil.getPatternPosition(_typeNumber);
        for (var i = 0; i < pos.length; i++) {
            for (var j = 0; j < pos.length; j++) {
                var row = pos[i];
                var col = pos[j];
                if (_modules[row][col] != null) continue;
                for (var r = -2; r <= 2; r++) {
                    for (var c = -2; c <= 2; c++) {
                        if (Math.abs(r) == 2 || Math.abs(c) == 2 || (r == 0 && c == 0) ) {
                            _modules[row + r][col + c] = true;
                        } else {
                            _modules[row + r][col + c] = false;
                        }
                    }
                }
            }
        }
    };

    var setupTimingPattern = function() {
        for (var i = 8; i < _moduleCount - 8; i++) {
            if (_modules[i][6] != null) continue;
            _modules[i][6] = (i % 2 == 0);
        }
        for (var i = 8; i < _moduleCount - 8; i++) {
            if (_modules[6][i] != null) continue;
            _modules[6][i] = (i % 2 == 0);
        }
    };

    var setupTypeNumber = function(test) {
        var bits = qrUtil.getBCHTypeNumber(_typeNumber);
        for (var i = 0; i < 18; i++) {
            var mod = (!test && ( (bits >> i) & 1) == 1);
            _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
        }
        for (var i = 0; i < 18; i++) {
            var mod = (!test && ( (bits >> i) & 1) == 1);
            _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
        }
    };

    var setupTypeInfo = function(test, maskPattern) {
        var data = (_errorCorrectionLevel << 3) | maskPattern;
        var bits = qrUtil.getBCHTypeInfo(data);
        for (var i = 0; i < 15; i++) {
            var mod = (!test && ( (bits >> i) & 1) == 1);
            if (i < 6) { _modules[i][8] = mod; } 
            else if (i < 8) { _modules[i + 1][8] = mod; } 
            else { _modules[_moduleCount - 15 + i][8] = mod; }
        }
        for (var i = 0; i < 15; i++) {
            var mod = (!test && ( (bits >> i) & 1) == 1);
            if (i < 8) { _modules[8][_moduleCount - i - 1] = mod; } 
            else if (i < 9) { _modules[8][15 - i - 1 + 1] = mod; } 
            else { _modules[8][15 - i - 1] = mod; }
        }
        _modules[_moduleCount - 8][8] = (!test);
    };

    var mapData = function(data, maskPattern) {
        var inc = -1;
        var row = _moduleCount - 1;
        var bitIndex = 7;
        var byteIndex = 0;
        for (var col = _moduleCount - 1; col > 0; col -= 2) {
            if (col == 6) col--;
            while (true) {
                for (var c = 0; c < 2; c++) {
                    if (_modules[row][col - c] == null) {
                        var dark = false;
                        if (byteIndex < data.length) { dark = ( ( (data[byteIndex] >>> bitIndex) & 1) == 1); }
                        var mask = qrUtil.getMask(maskPattern, row, col - c);
                        if (mask) { dark = !dark; }
                        _modules[row][col - c] = dark;
                        bitIndex--;
                        if (bitIndex == -1) { byteIndex++; bitIndex = 7; }
                    }
                }
                row += inc;
                if (row < 0 || _moduleCount <= row) {
                    row -= inc;
                    inc = -inc;
                    break;
                }
            }
        }
    };

    var createData = function(typeNumber, errorCorrectionLevel, dataList) {
        var rsBlocks = qrRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);
        var buffer = qrBitBuffer();
        for (var i = 0; i < dataList.length; i++) {
            var data = dataList[i];
            buffer.put(data.mode, 4);
            buffer.put(data.getLength(), qrUtil.getLengthInBits(data.mode, typeNumber) );
            data.write(buffer);
        }
        var totalDataCount = 0;
        for (var i = 0; i < rsBlocks.length; i++) { totalDataCount += rsBlocks[i].dataCount; }
        if (buffer.getLengthInBits() > totalDataCount * 8) { throw new Error("code length overflow. (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")"); }
        if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) { buffer.put(0, 4); }
        while (buffer.getLengthInBits() % 8 != 0) { buffer.putBit(false); }
        while (true) {
            if (buffer.getLengthInBits() >= totalDataCount * 8) break;
            buffer.put(PAD0, 8);
            if (buffer.getLengthInBits() >= totalDataCount * 8) break;
            buffer.put(PAD1, 8);
        }
        return createBytes(buffer, rsBlocks);
    };

    var createBytes = function(buffer, rsBlocks) {
        var offset = 0;
        var maxDcCount = 0;
        var maxEcCount = 0;
        var dcdata = new Array(rsBlocks.length);
        var ecdata = new Array(rsBlocks.length);
        for (var r = 0; r < rsBlocks.length; r++) {
            var dcCount = rsBlocks[r].dataCount;
            var ecCount = rsBlocks[r].totalCount - dcCount;
            maxDcCount = Math.max(maxDcCount, dcCount);
            maxEcCount = Math.max(maxEcCount, ecCount);
            dcdata[r] = new Array(dcCount);
            for (var i = 0; i < dcdata[r].length; i++) { dcdata[r][i] = 0xff & buffer.buffer[i + offset]; }
            offset += dcCount;
            var rsPoly = qrUtil.getErrorCorrectionPolynomial(ecCount);
            var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);
            var modPoly = rawPoly.mod(rsPoly);
            ecdata[r] = new Array(rsPoly.getLength() - 1);
            for (var i = 0; i < ecdata[r].length; i++) {
                var modIndex = i + modPoly.getLength() - ecdata[r].length;
                ecdata[r][i] = (modIndex >= 0) ? modPoly.get(modIndex) : 0;
            }
        }
        var totalCodeCount = 0;
        for (var i = 0; i < rsBlocks.length; i++) { totalCodeCount += rsBlocks[i].totalCount; }
        var data = new Array(totalCodeCount);
        var index = 0;
        for (var i = 0; i < maxDcCount; i++) {
            for (var r = 0; r < rsBlocks.length; r++) {
                if (i < dcdata[r].length) { data[index++] = dcdata[r][i]; }
            }
        }
        for (var i = 0; i < maxEcCount; i++) {
            for (var r = 0; r < rsBlocks.length; r++) {
                if (i < ecdata[r].length) { data[index++] = ecdata[r][i]; }
            }
        }
        return data;
    };

    return _qr;
};

// ---------------------------------------------------------------------
// Utils & Internal Classes
// ---------------------------------------------------------------------
var qrMode = { MODE_NUMBER : 1 << 0, MODE_ALPHA_NUM : 1 << 1, MODE_8BIT_BYTE : 1 << 2, MODE_KANJI : 1 << 3 };
var qrErrorCorrectionLevel = { L : 1, M : 0, Q : 3, H : 2 };
var qrMaskPattern = { PATTERN000 : 0, PATTERN001 : 1, PATTERN010 : 2, PATTERN011 : 3, PATTERN100 : 4, PATTERN101 : 5, PATTERN110 : 6, PATTERN111 : 7 };
var qrUtil = (function() {
    var PATTERN_POSITION_TABLE = [ [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146], [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170] ];
    var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
    var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);
    var _qrUtil = {};
    _qrUtil.getBCHTypeInfo = function(data) {
        var res = data << 10;
        while (qrUtil.getBCHDigit(res) - qrUtil.getBCHDigit(G15) >= 0) { res ^= (G15 << (qrUtil.getBCHDigit(res) - qrUtil.getBCHDigit(G15) ) ); }
        return ( (data << 10) | res) ^ G15_MASK;
    };
    _qrUtil.getBCHTypeNumber = function(data) {
        var res = data << 12;
        while (qrUtil.getBCHDigit(res) - qrUtil.getBCHDigit(G18) >= 0) { res ^= (G18 << (qrUtil.getBCHDigit(res) - qrUtil.getBCHDigit(G18) ) ); }
        return (data << 12) | res;
    };
    _qrUtil.getBCHDigit = function(data) { var digit = 0; while (data != 0) { digit++; data >>>= 1; } return digit; };
    _qrUtil.getPatternPosition = function(typeNumber) { return PATTERN_POSITION_TABLE[typeNumber - 1]; };
    _qrUtil.getMask = function(maskPattern, i, j) {
        switch (maskPattern) {
            case qrMaskPattern.PATTERN000 : return (i + j) % 2 == 0;
            case qrMaskPattern.PATTERN001 : return i % 2 == 0;
            case qrMaskPattern.PATTERN010 : return j % 3 == 0;
            case qrMaskPattern.PATTERN011 : return (i + j) % 3 == 0;
            case qrMaskPattern.PATTERN100 : return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 == 0;
            case qrMaskPattern.PATTERN101 : return (i * j) % 2 + (i * j) % 3 == 0;
            case qrMaskPattern.PATTERN110 : return ( (i * j) % 2 + (i * j) % 3) % 2 == 0;
            case qrMaskPattern.PATTERN111 : return ( (i * j) % 3 + (i + j) % 2) % 2 == 0;
            default : throw new Error("bad maskPattern:" + maskPattern);
        }
    };
    _qrUtil.getErrorCorrectionPolynomial = function(errorCorrectionLength) {
        var a = qrPolynomial([1], 0);
        for (var i = 0; i < errorCorrectionLength; i++) { a = a.multiply(qrPolynomial([1, qrMath.gexp(i)], 0) ); }
        return a;
    };
    _qrUtil.getLengthInBits = function(mode, type) {
        if (1 <= type && type < 10) {
            switch (mode) {
                case qrMode.MODE_NUMBER : return 10;
                case qrMode.MODE_ALPHA_NUM : return 9;
                case qrMode.MODE_8BIT_BYTE : return 8;
                case qrMode.MODE_KANJI : return 8;
                default : throw new Error("mode:" + mode);
            }
        } else if (type < 27) {
            switch (mode) {
                case qrMode.MODE_NUMBER : return 12;
                case qrMode.MODE_ALPHA_NUM : return 11;
                case qrMode.MODE_8BIT_BYTE : return 16;
                case qrMode.MODE_KANJI : return 10;
                default : throw new Error("mode:" + mode);
            }
        } else if (type < 41) {
            switch (mode) {
                case qrMode.MODE_NUMBER : return 14;
                case qrMode.MODE_ALPHA_NUM : return 13;
                case qrMode.MODE_8BIT_BYTE : return 16;
                case qrMode.MODE_KANJI : return 12;
                default : throw new Error("mode:" + mode);
            }
        } else { throw new Error("type:" + type); }
    };
    _qrUtil.getLostPoint = function(qrCode) {
        var moduleCount = qrCode.getModuleCount();
        var lostPoint = 0;
        for (var row = 0; row < moduleCount; row++) {
            for (var col = 0; col < moduleCount; col++) {
                var sameCount = 0;
                var dark = qrCode.isDark(row, col);
                for (var r = -1; r <= 1; r++) {
                    if (row + r < 0 || moduleCount <= row + r) continue;
                    for (var c = -1; c <= 1; c++) {
                        if (col + c < 0 || moduleCount <= col + c) continue;
                        if (r == 0 && c == 0) continue;
                        if (dark == qrCode.isDark(row + r, col + c) ) { sameCount++; }
                    }
                }
                if (sameCount > 5) { lostPoint += (3 + sameCount - 5); }
            }
        }
        for (var row = 0; row < moduleCount - 1; row++) {
            for (var col = 0; col < moduleCount - 1; col++) {
                var count = 0;
                if (qrCode.isDark(row, col) ) count++;
                if (qrCode.isDark(row + 1, col) ) count++;
                if (qrCode.isDark(row, col + 1) ) count++;
                if (qrCode.isDark(row + 1, col + 1) ) count++;
                if (count == 0 || count == 4) { lostPoint += 3; }
            }
        }
        for (var row = 0; row < moduleCount; row++) {
            for (var col = 0; col < moduleCount - 6; col++) {
                if (qrCode.isDark(row, col) && !qrCode.isDark(row, col + 1) && qrCode.isDark(row, col + 2) && qrCode.isDark(row, col + 3) && qrCode.isDark(row, col + 4) && !qrCode.isDark(row, col + 5) && qrCode.isDark(row, col + 6) ) { lostPoint += 40; }
            }
        }
        for (var col = 0; col < moduleCount; col++) {
            for (var row = 0; row < moduleCount - 6; row++) {
                if (qrCode.isDark(row, col) && !qrCode.isDark(row + 1, col) && qrCode.isDark(row + 2, col) && qrCode.isDark(row + 3, col) && qrCode.isDark(row + 4, col) && !qrCode.isDark(row + 5, col) && qrCode.isDark(row + 6, col) ) { lostPoint += 40; }
            }
        }
        var darkCount = 0;
        for (var col = 0; col < moduleCount; col++) {
            for (var row = 0; row < moduleCount; row++) {
                if (qrCode.isDark(row, col) ) { darkCount++; }
            }
        }
        var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
        lostPoint += ratio * 10;
        return lostPoint;
    };
    return _qrUtil;
})();

var qrMath = (function() {
    var EXP_TABLE = new Array(256);
    var LOG_TABLE = new Array(256);
    for (var i = 0; i < 8; i++) { EXP_TABLE[i] = 1 << i; }
    for (var i = 8; i < 256; i++) { EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8]; }
    for (var i = 0; i < 255; i++) { LOG_TABLE[EXP_TABLE[i]] = i; }
    var _qrMath = {};
    _qrMath.gexp = function(n) { while (n < 0) { n += 255; } while (n >= 256) { n -= 255; } return EXP_TABLE[n]; };
    _qrMath.glog = function(n) { if (n < 1) { throw new Error("glog(" + n + ")"); } return LOG_TABLE[n]; };
    return _qrMath;
})();

function qrPolynomial(num, shift) {
    if (num.length == undefined) { throw new Error(num.length + "/" + shift); }
    var _num = (function() {
        var offset = 0;
        while (offset < num.length && num[offset] == 0) { offset++; }
        var _num = new Array(num.length - offset + shift);
        for (var i = 0; i < num.length - offset; i++) { _num[i] = num[i + offset]; }
        return _num;
    })();
    var _qrPolynomial = {};
    _qrPolynomial.get = function(index) { return _num[index]; };
    _qrPolynomial.getLength = function() { return _num.length; };
    _qrPolynomial.multiply = function(e) {
        var num = new Array(_qrPolynomial.getLength() + e.getLength() - 1);
        for (var i = 0; i < _qrPolynomial.getLength(); i++) {
            for (var j = 0; j < e.getLength(); j++) { num[i + j] ^= qrMath.gexp(qrMath.glog(_qrPolynomial.get(i) ) + qrMath.glog(e.get(j) ) ); }
        }
        return qrPolynomial(num, 0);
    };
    _qrPolynomial.mod = function(e) {
        if (_qrPolynomial.getLength() - e.getLength() < 0) { return _qrPolynomial; }
        var ratio = qrMath.glog(_qrPolynomial.get(0) ) - qrMath.glog(e.get(0) );
        var num = new Array(_qrPolynomial.getLength() );
        for (var i = 0; i < _qrPolynomial.getLength(); i++) { num[i] = _qrPolynomial.get(i); }
        for (var i = 0; i < e.getLength(); i++) { num[i] ^= qrMath.gexp(qrMath.glog(e.get(i) ) + ratio); }
        return qrPolynomial(num, 0).mod(e);
    };
    return _qrPolynomial;
};

function qrRSBlock(totalCount, dataCount) {
    var _qrRSBlock = {};
    _qrRSBlock.totalCount = totalCount;
    _qrRSBlock.dataCount = dataCount;
    return _qrRSBlock;
};

qrRSBlock.RS_BLOCK_TABLE = [ [1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9], [1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16], [1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13], [1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9], [1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12], [2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15], [2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14], [2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15], [2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13], [2, 86, 68, 2, 87, 69], [4, 43, 27, 1, 44, 28], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16] ];
qrRSBlock.getRSBlocks = function(typeNumber, errorCorrectionLevel) {
    var rsBlock = qrRSBlock.getRsBlockTable(typeNumber, errorCorrectionLevel);
    if (rsBlock == undefined) { throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectionLevel:" + errorCorrectionLevel); }
    var length = rsBlock.length / 3;
    var list = [];
    for (var i = 0; i < length; i++) {
        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];
        for (var j = 0; j < count; j++) { list.push(qrRSBlock(totalCount, dataCount) ); }
    }
    return list;
};
qrRSBlock.getRsBlockTable = function(typeNumber, errorCorrectionLevel) {
    var ecl = errorCorrectionLevel;
    if (typeof ecl === 'string') {
        switch (ecl.toUpperCase()) {
            case 'L': ecl = qrErrorCorrectionLevel.L; break;
            case 'M': ecl = qrErrorCorrectionLevel.M; break;
            case 'Q': ecl = qrErrorCorrectionLevel.Q; break;
            case 'H': ecl = qrErrorCorrectionLevel.H; break;
        }
    }
    switch (ecl) {
        case qrErrorCorrectionLevel.L : return qrRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
        case qrErrorCorrectionLevel.M : return qrRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
        case qrErrorCorrectionLevel.Q : return qrRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
        case qrErrorCorrectionLevel.H : return qrRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
        default : return undefined;
    }
};

function qrBitBuffer() {
    var _buffer = [];
    var _length = 0;
    var _qrBitBuffer = {};
    _qrBitBuffer.buffer = _buffer;
    _qrBitBuffer.getLengthInBits = function() { return _length; };
    _qrBitBuffer.get = function(index) { var bufIndex = Math.floor(index / 8); return ( (_buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1; };
    _qrBitBuffer.put = function(num, length) { for (var i = 0; i < length; i++) { _qrBitBuffer.putBit( ( (num >>> (length - i - 1) ) & 1) == 1); } };
    _qrBitBuffer.putBit = function(bit) {
        var bufIndex = Math.floor(_length / 8);
        if (_buffer.length <= bufIndex) { _buffer.push(0); }
        if (bit) { _buffer[bufIndex] |= (0x80 >>> (_length % 8) ); }
        _length++;
    };
    return _qrBitBuffer;
};

function qr8BitByte(data) {
    var _mode = qrMode.MODE_8BIT_BYTE;
    var _data = data;
    var _bytes = (function() {
        var bytes = [];
        for (var i = 0; i < data.length; i++) {
            var c = data.charCodeAt(i);
            if (c > 0xff) {
                // UTF-8 encode
                bytes.push(0xe0 | ( (c >> 12) & 0x0f) );
                bytes.push(0x80 | ( (c >> 6) & 0x3f) );
                bytes.push(0x80 | (c & 0x3f) );
            } else {
                bytes.push(c);
            }
        }
        return bytes;
    })();
    var _qr8BitByte = {};
    _qr8BitByte.mode = _mode;
    _qr8BitByte.getLength = function() { return _bytes.length; };
    _qr8BitByte.write = function(buffer) { for (var i = 0; i < _bytes.length; i++) { buffer.put(_bytes[i], 8); } };
    return _qr8BitByte;
}

window.qrcode = qrcode;
