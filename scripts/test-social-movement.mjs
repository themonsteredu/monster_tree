// Pure movement-envelope checks, no browser or network.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const source=fs.readFileSync(new URL("../src/lib/social/movement.ts",import.meta.url),"utf8");
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:module.exports});
const {clampRoomPosition,clampPlazaPosition}=module.exports;
let checks=0;
for(const x of [-100,0,12,33,48,50,57,67,88,100,NaN,Infinity]) {
  for(const y of [-100,0,52,55,60,80,90,100,NaN,Infinity]) {
    const room=clampRoomPosition({x,y});
    const distance=Math.abs(room.x-50);
    assert.ok(room.x>=12&&room.x<=88);
    assert.ok(room.y>=Math.max(55,43+distance*.43)&&room.y<=94-distance*.46);
    assert.ok(room.x>=8&&room.x<=92&&room.y>=8&&room.y<=92,"room positions must satisfy the presence API and database limits");
    const plaza=clampPlazaPosition({x,y});
    assert.ok(plaza.x>=10&&plaza.x<=90&&plaza.y>=52&&plaza.y<=91);
    assert.ok(!(plaza.x>48&&plaza.x<68&&plaza.y<63));
    assert.ok(!(plaza.y>85&&plaza.x<34));
    checks++;
  }
}
console.log(`Movement envelopes: ${checks} boundary and non-finite coordinate pairs passed.`);
