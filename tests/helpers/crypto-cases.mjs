import {moo} from '../../dist/index.js';
const S=moo.string,I=moo.int;
export const cryptoCases={
 crypt:['crypt("foobar","J3")',S('J3fSFQfgkp26w')],salt:['salt("","~00~01")',S('./')],
 string_hash:['string_hash("abc")',p=>S(p==='lambdamoo'?'900150983CD24FB0D6963F7D28E17F72':'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD')],
 binary_hash:['binary_hash("a~62c")',p=>S(p==='lambdamoo'?'900150983CD24FB0D6963F7D28E17F72':'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD')],
 value_hash:['value_hash(1)',p=>S(p==='lambdamoo'?'C4CA4238A0B923820DCC509A6F75849B':'6B86B273FF34FCE19D6B804EFF5A3F5747ADA4EAA22F1D49C01E52DDB7875B4B')],
 string_hmac:['string_hmac("abc","key")',S('9C196E32DC0175F86F4B1CB89289D6619DE6BEE699E4C378E68309ED97A1A6AB')],
 binary_hmac:['binary_hmac("a~62c","key")',S('9C196E32DC0175F86F4B1CB89289D6619DE6BEE699E4C378E68309ED97A1A6AB')],
 value_hmac:['value_hmac("abc","key") == string_hmac(toliteral("abc"),"key")',I(1)],
 random_bytes:['random_bytes(0)',S('')],
 argon2:['argon2("password","saltsalt",1,8)',S('$argon2id$v=19$m=8,t=1,p=1$c2FsdHNhbHQ$ePHX6tepXWusf6b6MH9TJ+SVGted3R/FtCkxq/X5UVo')],
 argon2_verify:['argon2_verify("$argon2id$v=19$m=8,t=1,p=1$c2FsdHNhbHQ$ePHX6tepXWusf6b6MH9TJ+SVGted3R/FtCkxq/X5UVo","password")',I(1)],
 time:['time()>0',I(1)],ctime:['ctime(0)',S('Thu Jan  1 00:00:00 1970 UTC')],ftime:['ftime()>0.0',I(1)],seconds_left:['seconds_left()>0',I(1)],random:['random(1)',I(1)],frandom:['frandom(0.0)',moo.float(0)],reseed_random:['reseed_random()',I(0)],
};
const toast=new Set(['salt','string_hmac','binary_hmac','value_hmac','random_bytes','argon2','argon2_verify','ftime','frandom','reseed_random']);
export const cryptoAvailable=(name,profile)=>profile==='toaststunt'||!toast.has(name);
