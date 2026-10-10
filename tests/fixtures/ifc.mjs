export function modelFixture(prefix = "$", units = true) {
  return new TextEncoder().encode(`ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Synthetic regression fixture'),'2;1');
FILE_NAME('fixture.ifc','2026-01-01T00:00:00',('Test'),('Test'),'Test','Test','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('0ABCDEFGHIJKLMNOPQRSTU',$,'Project',$,$,$,$,(#2),${units ? "#3" : "$"});
#2=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,#4,$);
#3=IFCUNITASSIGNMENT((#7));
#4=IFCAXIS2PLACEMENT3D(#5,$,$);
#5=IFCCARTESIANPOINT((1.,2.,3.));
#7=IFCSIUNIT(*,.LENGTHUNIT.,${prefix},.METRE.);
#8=IFCLOCALPLACEMENT($,#4);
#9=IFCCOLUMN('1ABCDEFGHIJKLMNOPQRSTU',$,'Column; with /* literal */ text',$,$,#8,#20,'C-1',.COLUMN.);
#10=IFCCARTESIANPOINT((0.,0.));
#11=IFCAXIS2PLACEMENT2D(#10,$);
#12=IFCRECTANGLEPROFILEDEF(.AREA.,$,#11,0.3,0.4);
#13=IFCDIRECTION((0.,0.,1.));
#14=IFCCARTESIANPOINT((0.,0.,0.));
#15=IFCAXIS2PLACEMENT3D(#14,$,$);
#16=IFCEXTRUDEDAREASOLID(#12,#15,#13,3.);
#19=IFCSHAPEREPRESENTATION(#2,'Body','SweptSolid',(#16));
#20=IFCPRODUCTDEFINITIONSHAPE($,$,(#19));
#21=IFCBUILDINGSTOREY('2ABCDEFGHIJKLMNOPQRSTU',$,'Level 2',$,$,#8,$,$,.ELEMENT.,3.);
#22=IFCRELCONTAINEDINSPATIALSTRUCTURE('3ABCDEFGHIJKLMNOPQRSTU',$,$,$,(#9),#21);
#23=IFCPROPERTYSINGLEVALUE('Axes',$,IFCLABEL('A-1'),$);
#24=IFCPROPERTYSET('0BBCDEFGHIJKLMNOPQRSTU',$,'Inspection',$,(#23));
#25=IFCRELDEFINESBYPROPERTIES('1BBCDEFGHIJKLMNOPQRSTU',$,$,$,(#9),#24);
ENDSEC;
END-ISO-10303-21;`);
}

// Exporter-shaped cases: multiple representations, nested placements, mapped and CSG bodies.
export function engineeringFixtures() {
  const base = new TextDecoder().decode(modelFixture());
  const encode = source => new TextEncoder().encode(source);
  const append = (source, lines) => source.replace("ENDSEC;\nEND-ISO", `${lines}\nENDSEC;\nEND-ISO`);
  return {
    bodyAndAxis: encode(append(base.replace("(#19));", "(#30,#19));"), "#30=IFCSHAPEREPRESENTATION(#2,'Axis','Curve3D',(#31));\n#31=IFCPOLYLINE((#5,#14));")),
    nestedRotation: encode(append(base.replace("#8=IFCLOCALPLACEMENT($,#4)", "#8=IFCLOCALPLACEMENT(#30,#4)"), "#30=IFCLOCALPLACEMENT($,#31);\n#31=IFCAXIS2PLACEMENT3D(#32,#33,#34);\n#32=IFCCARTESIANPOINT((4000000.,5000000.,100.));\n#33=IFCDIRECTION((0.,0.,1.));\n#34=IFCDIRECTION((0.,1.,0.));")),
    mappedBody: encode(append(base.replace("'SweptSolid',(#16)", "'MappedRepresentation',(#30)"), "#30=IFCMAPPEDITEM(#31,#32);\n#31=IFCREPRESENTATIONMAP(#15,#33);\n#32=IFCCARTESIANTRANSFORMATIONOPERATOR3D($,$,#14,1.,$);\n#33=IFCSHAPEREPRESENTATION(#2,'Body','SweptSolid',(#16));")),
    booleanBody: encode(append(base.replace("'SweptSolid',(#16)", "'CSG',(#30)"), "#30=IFCBOOLEANRESULT(.DIFFERENCE.,#16,#31);\n#31=IFCEXTRUDEDAREASOLID(#12,#32,#13,1.);\n#32=IFCAXIS2PLACEMENT3D(#33,$,$);\n#33=IFCCARTESIANPOINT((0.1,0.1,1.));"))
  };
}
