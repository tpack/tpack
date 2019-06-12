import { Processor } from "../core/options"
import { VFile } from "../core/vfile"

export default class JJEncode implements Processor {
	process(file: VFile, options: any) {
		file.content = jjencode(options.char || "$", file.content)
		file.sourceMapObject = undefined
	}
}

function jjencode(gv: string, text: string) {
	var r = ""
	var n
	var b = ["___", "__$", "_$_", "_$$", "$__", "$_$", "$$_", "$$$", "$___", "$__$", "$_$_", "$_$$", "$$__", "$$_$", "$$$_", "$$$$"]
	var s = ""
	for (var i = 0; i < text.length; i++) {
		n = text.charCodeAt(i)
		if (n == 0x22 || n == 0x5c) {
			s += "\\\\\\" + text.charAt(i).toString()
		} else if ((0x21 <= n && n <= 0x2f) || (0x3A <= n && n <= 0x40) || (0x5b <= n && n <= 0x60) || (0x7b <= n && n <= 0x7f)) {
			//}else if( (0x20 <= n && n <= 0x2f) || (0x3A <= n == 0x40) || ( 0x5b <= n && n <= 0x60 ) || ( 0x7b <= n && n <= 0x7f ) ){
			s += text.charAt(i)
		} else if ((0x30 <= n && n <= 0x39) || (0x61 <= n && n <= 0x66)) {
			if (s) r += "\"" + s + "\"+"
			r += gv + "." + b[n < 0x40 ? n - 0x30 : n - 0x57] + "+"
			s = ""
		} else if (n == 0x6c) { // 'l'
			if (s) r += "\"" + s + "\"+"
			r += "(![]+\"\")[" + gv + "._$_]+"
			s = ""
		} else if (n == 0x6f) { // 'o'
			if (s) r += "\"" + s + "\"+"
			r += gv + "._$+"
			s = ""
		} else if (n == 0x74) { // 'u'
			if (s) r += "\"" + s + "\"+"
			r += gv + ".__+"
			s = ""
		} else if (n == 0x75) { // 'u'
			if (s) r += "\"" + s + "\"+"
			r += gv + "._+"
			s = ""
		} else if (n < 128) {
			if (s) r += "\"" + s
			else r += "\""
			r += "\\\\\"+" + n.toString(8).replace(/[0-7]/g, c => gv + "." + b[+c] + "+")
			s = ""
		} else {
			if (s) r += "\"" + s
			else r += "\""
			r += "\\\\\"+" + gv + "._+" + n.toString(16).replace(/[0-9a-f]/gi, c => gv + "." + b[parseInt(c, 16)] + "+")
			s = ""
		}
	}
	if (s) r += "\"" + s + "\"+"

	return gv + "=~[];" +
		gv + "={___:++" + gv + ",$$$$:(![]+\"\")[" + gv + "],__$:++" + gv + ",$_$_:(![]+\"\")[" + gv + "],_$_:++" +
		gv + ",$_$$:({}+\"\")[" + gv + "],$$_$:(" + gv + "[" + gv + "]+\"\")[" + gv + "],_$$:++" + gv + ",$$$_:(!\"\"+\"\")[" +
		gv + "],$__:++" + gv + ",$_$:++" + gv + ",$$__:({}+\"\")[" + gv + "],$$_:++" + gv + ",$$$:++" + gv + ",$___:++" + gv + ",$__$:++" + gv + "};" +
		gv + ".$_=" +
		"(" + gv + ".$_=" + gv + "+\"\")[" + gv + ".$_$]+" +
		"(" + gv + "._$=" + gv + ".$_[" + gv + ".__$])+" +
		"(" + gv + ".$$=(" + gv + ".$+\"\")[" + gv + ".__$])+" +
		"((!" + gv + ")+\"\")[" + gv + "._$$]+" +
		"(" + gv + ".__=" + gv + ".$_[" + gv + ".$$_])+" +
		"(" + gv + ".$=(!\"\"+\"\")[" + gv + ".__$])+" +
		"(" + gv + "._=(!\"\"+\"\")[" + gv + "._$_])+" +
		gv + ".$_[" + gv + ".$_$]+" +
		gv + ".__+" +
		gv + "._$+" +
		gv + ".$;" +
		gv + ".$$=" +
		gv + ".$+" +
		"(!\"\"+\"\")[" + gv + "._$$]+" +
		gv + ".__+" +
		gv + "._+" +
		gv + ".$+" +
		gv + ".$$;" +
		gv + ".$=(" + gv + ".___)[" + gv + ".$_][" + gv + ".$_];" +
		gv + ".$(" + gv + ".$(" + gv + ".$$+\"\\\"\"+" + r + "\"\\\"\")())();"
}