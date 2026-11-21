import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageCapacity } from '../src/FitPager';

test('pagination fits only whole rows in the observed space',()=>{
  assert.equal(pageCapacity(420,70),6);
  assert.equal(pageCapacity(420,70,42),5);
  assert.equal(pageCapacity(149,72),2);
  assert.equal(pageCapacity(140,160),1);
  assert.equal(pageCapacity(0,160),1);
  assert.equal(pageCapacity(240,160,60),1);
  assert.equal(pageCapacity(300,50,0),6);
});

test('pagination handles invalid and insufficient row dimensions defensively',()=>{
  assert.equal(pageCapacity(50,0),50);
  assert.equal(pageCapacity(-10,90),1);
  assert.equal(pageCapacity(10,90,50),1);
});
