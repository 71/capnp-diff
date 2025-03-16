@0xddfbfe1a5031487c;

struct Struct {
  field0 @0 :UInt32;
  field1 @1 :Text;
}

enum Enum {
  enumerant0 @0;
  enumerant1 @1;
}

interface Interface {
  method0 @0 (in0 :UInt32, in1 :Data) -> (out0 :UInt32, out1 :Data);
  method1 @1 (foo :Text) -> (bar :UInt32);
}
