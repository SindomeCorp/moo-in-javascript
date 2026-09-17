import {moo} from '../../dist/index.js';
const I=moo.int,S=moo.string,L=(...v)=>moo.list(v);
export const codecCases={
 encode_binary:['encode_binary("a",{0,126,255})',S('a~00~7E~FF')],decode_binary:['decode_binary("ab~00c")',L(S('ab'),I(0),S('c'))],
 chr:['chr(65,{66,"C"})',S('ABC')],encode_base64:['encode_base64("foo")',S('Zm9v')],decode_base64:['decode_base64("AA==")',S('~00')],
 url_encode:['url_encode("a b/c")',S('a%20b%2Fc')],url_decode:['url_decode("a%20b%2Fc")',S('a b/c')],
 strtr:['strtr("AbCd","ac","xy")',S('XbYd')],
 parse_json:['parse_json("[9223372036854775807, null, true]")',L(I(9223372036854775807n),moo.error('E_NONE'),I(1))],
 generate_json:['generate_json({1,"x",#7},"embedded-types")',S('[1,"x","#7|obj"]')],
 parse_ansi:['parse_ansi("[red]Hi[normal]")',S('\x1b[31mHi\x1b[0m')],remove_ansi:['remove_ansi("[red]Hi[normal]")',S('Hi')],
};
export const codecAvailable=(name,profile)=>!(name in codecCases)||profile==='toaststunt'||['encode_binary','decode_binary'].includes(name);
