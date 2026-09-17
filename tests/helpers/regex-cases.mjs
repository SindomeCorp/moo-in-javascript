import {moo} from '../../dist/index.js';
const I=moo.int,S=moo.string,L=(...v)=>moo.list(v);
const absent=L(...Array.from({length:9},()=>L(I(0),I(-1))));
export const regexCases={
 match:['match("Abc","b")',L(I(2),I(2),absent,S('Abc'))],rmatch:['rmatch("ababa","aba")',L(I(3),I(5),absent,S('ababa'))],
 substitute:['substitute("%2, %1!",match("Hello World","%(Hello%) %(World%)"))',S('World, Hello!')],
 pcre_match:['pcre_match("a1b2","[0-9]",0,0)',L(moo.map([[S('0'),moo.map([[S('match'),S('1')],[S('position'),L(I(2),I(2))]])]]))],
 pcre_replace:['pcre_replace("A1 B2","s/([A-Z])([0-9])/$2$1/g")',S('1A 2B')],
};
export const regexAvailable=(name,profile)=>profile==='toaststunt'||!['pcre_match','pcre_replace'].includes(name);
