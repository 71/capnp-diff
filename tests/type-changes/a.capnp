@0xddfbfe1a5031487c;

struct Types {
  enum Enum {
    a @0;
    b @1;
  }

  enumToU16 @0 :Enum;
  u16ToEnum @1 :UInt16;

  u8ToU16 @2 :UInt8;
  u16ToU8 @3 :UInt16;
}
