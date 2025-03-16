@0xddfbfe1a5031487c;

struct Types {
  enum Enum {
    a @0;
    b @1;
  }

  enumToU16 @0 :UInt16;
  u16ToEnum @1 :Enum;

  u8ToU16 @2 :UInt16;
  u16ToU8 @3 :UInt8;
}
