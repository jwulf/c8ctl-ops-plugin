/**
 * Embedded smoke-test BPMN fixture (clean-room, Apache-2.0).
 *
 * A minimal process that auto-completes: a start event flows through an
 * embedded subprocess (start -> end) to the end event. It requires no job
 * workers, so a created instance reaches a terminal state on its own — ideal
 * for exercising deploy -> create -> walk -> cleanup end to end.
 */

export const SMOKE_TEST_PROCESS_ID = "c8ctl-ops-smoke-test";
export const SMOKE_TEST_RESOURCE_NAME = "c8ctl-ops-smoke-test.bpmn";

export const SMOKE_TEST_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="c8ctl-ops-smoke-test-definitions"
                  targetNamespace="http://camunda.org/schema/c8ctl-ops">
  <bpmn:process id="${SMOKE_TEST_PROCESS_ID}" name="c8ctl ops smoke test" isExecutable="true">
    <bpmn:startEvent id="StartEvent">
      <bpmn:outgoing>Flow_start_sub</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:subProcess id="Subprocess" name="smoke subprocess">
      <bpmn:incoming>Flow_start_sub</bpmn:incoming>
      <bpmn:outgoing>Flow_sub_end</bpmn:outgoing>
      <bpmn:startEvent id="SubStart">
        <bpmn:outgoing>Flow_substart_subend</bpmn:outgoing>
      </bpmn:startEvent>
      <bpmn:endEvent id="SubEnd">
        <bpmn:incoming>Flow_substart_subend</bpmn:incoming>
      </bpmn:endEvent>
      <bpmn:sequenceFlow id="Flow_substart_subend" sourceRef="SubStart" targetRef="SubEnd" />
    </bpmn:subProcess>
    <bpmn:endEvent id="EndEvent">
      <bpmn:incoming>Flow_sub_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_start_sub" sourceRef="StartEvent" targetRef="Subprocess" />
    <bpmn:sequenceFlow id="Flow_sub_end" sourceRef="Subprocess" targetRef="EndEvent" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram">
    <bpmndi:BPMNPlane id="Plane" bpmnElement="${SMOKE_TEST_PROCESS_ID}">
      <bpmndi:BPMNShape id="StartEvent_di" bpmnElement="StartEvent">
        <dc:Bounds x="160" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Subprocess_di" bpmnElement="Subprocess" isExpanded="false">
        <dc:Bounds x="250" y="78" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_di" bpmnElement="EndEvent">
        <dc:Bounds x="430" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_start_sub_di" bpmnElement="Flow_start_sub">
        <di:waypoint x="196" y="118" />
        <di:waypoint x="250" y="118" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_sub_end_di" bpmnElement="Flow_sub_end">
        <di:waypoint x="370" y="118" />
        <di:waypoint x="430" y="118" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
