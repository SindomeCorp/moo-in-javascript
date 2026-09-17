import {moo} from '../../dist/index.js';
const I=moo.int,F=moo.float,S=moo.string,O=moo.object,L=(...values)=>moo.list(values);
export const utilityCases={
 simplex_noise:['simplex_noise({0.0})',F(0)],
 toint:['toint("42.9")',I(42)],tonum:['tonum("42")',I(42)],toobj:['toobj("#42")',O(42)],tofloat:['tofloat(7)',F(7)],
 min:['min(4,-2,8)',I(-2)],max:['max(4,-2,8)',I(8)],abs:['abs(-7)',I(7)],
 sqrt:['sqrt(4.0)',F(2)],cbrt:['cbrt(8.0)',F(2)],sin:['sin(0.0)',F(0)],cos:['cos(0.0)',F(1)],tan:['tan(0.0)',F(0)],
 asin:['asin(0.0)',F(0)],acos:['acos(1.0)',F(0)],atan:['atan(0.0)',F(0)],atan2:['atan2(0.0,1.0)',F(0)],
 sinh:['sinh(0.0)',F(0)],cosh:['cosh(0.0)',F(1)],tanh:['tanh(0.0)',F(0)],acosh:['acosh(1.0)',F(0)],atanh:['atanh(0.0)',F(0)],asinh:['asinh(0.0)',F(0)],
 exp:['exp(0.0)',F(1)],log:['log(1.0)',F(0)],log10:['log10(1.0)',F(0)],ceil:['ceil(1.2)',F(2)],floor:['floor(1.8)',F(1)],trunc:['trunc(-1.8)',F(-1)],round:['round(-1.5)',F(-2)],
 floatstr:['floatstr(1.5,2)',S('1.50')],distance:['distance({0,0},{3,4})',F(5)],relative_heading:['relative_heading({0.0,0.0,0.0},{1.0,0.0,0.0})',L(I(0),I(0))],
 listappend:['listappend({1,2},3)',L(I(1),I(2),I(3))],listinsert:['listinsert({1,2},3)',L(I(3),I(1),I(2))],listdelete:['listdelete({1,2},1)',L(I(2))],listset:['listset({1,2},3,2)',L(I(1),I(3))],
 setadd:['setadd({1,2},3)',L(I(1),I(2),I(3))],setremove:['setremove({1,2},1)',L(I(2))],is_member:['is_member("A",{"a","A"})',I(2)],all_members:['all_members("A",{"a","b","A"})',L(I(1),I(3))],
 strcmp:['strcmp("A","a")',I(-1)],strsub:['strsub("ABab","ab","x")',S('xx')],explode:['explode("a  b")',L(S('a'),S('b'))],reverse:['reverse("abc")',S('cba')],slice:['slice({{1,2},{3,4}},2)',L(I(2),I(4))],sort:['sort({3,1,2})',L(I(1),I(2),I(3))],
};
export const toastUtilities=new Set(['simplex_noise','cbrt','acosh','atanh','asinh','round','atan2','distance','relative_heading','all_members','explode','reverse','slice','sort']);
export const utilityAvailable=(name,profile)=>name==='tonum'?profile==='lambdamoo':profile==='toaststunt'||!toastUtilities.has(name);
