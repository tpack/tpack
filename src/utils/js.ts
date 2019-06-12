/**
 * 编码 JavaScript 中的特殊字符
 * @param value 要编码的字符串
 */
export function encodeJS(value: string) {
	return quoteJSString(value, "")
}

/**
 * 解码 JavaScript 转义字符
 * @param value 要解码的字符串
 */
export function decodeJS(value: string) {
	return value.replace(/\\(?:x([\da-fA-F]{2})|u([\da-fA-F]{4})|u\{([\da-fA-F]+)\}|.)/sg, (source, hex?: string, unicode?: string, unicodeCodePoint?: string) => {
		if (source.length > 2) {
			return String.fromCodePoint(parseInt(hex || unicode || unicodeCodePoint!, 16))
		}
		switch (source.charCodeAt(1)) {
			case 34 /*"*/:
				return '\"'
			case 39 /*'*/:
				return "'"
			case 92 /*\*/:
				return "\\"
			case 10 /*\n*/:
			case 13 /*\r*/:
				return ""
			case 110 /*n*/:
				return "\n"
			case 114 /*r*/:
				return "\r"
			case 118 /*v*/:
				return "\v"
			case 116 /*t*/:
				return "\t"
			case 98 /*b*/:
				return "\b"
			case 102 /*f*/:
				return "\f"
			case 48 /*0*/:
				return "\0"
			default:
				return source.charAt(1)
		}
	})
}

/**
 * 编码 JavaScript 字符串并添加引号
 * @param value 要编码的字符串
 * @param quote 要添加的引号，默认根据属性值自动推导
 */
export function quoteJSString(value: string, quote?: string) {
	// JS 字符串不允许出现 \u2028 和 \u2029 换行符，但 JSON 允许
	value = JSON.stringify(value).replace(/[\u2028\u2029]/g, char => char.charCodeAt(0) === 0x2028 ? "\\u2028" : "\\u2029")
	if (quote !== undefined && quote !== '"') {
		value = value.slice(1, -1)
		if (quote.charCodeAt(0) === 39 /*'*/) {
			value = value.replace(/'/g, "\\'")
		}
		value = `${quote}${value}${quote}`
	}
	return value
}

/**
 * 删除 JavaScript 字符串的引号并解码
 * @param value 要解码的字符串
 */
export function unquoteJSString(value: any) {
	return decodeJS(value.replace(/^(['"])(.*)\1$/s, "$2"))
}